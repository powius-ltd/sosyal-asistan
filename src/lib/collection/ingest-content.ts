/**
 * İçerik ingest'i (yalnız sunucu, service role): `NormalizedContent[]` → `content_items` upsert + her içerik için
 * `metric_snapshots` satırı. Eşleme saf ve ayrıdır (`content-rows.ts`); burada yalnız toplu DB yazımı vardır.
 *
 *  - N+1 yok: satırlar parça parça (parça başına tek istek) okunur/yazılır.
 *  - İçerik upsert'i `(workspace_id, platform, external_id)` üzerindedir; skor önbelleği sütunları gönderilmez, yani
 *    yeniden toplama mevcut skoru ezmez (skoru `lib/scoring` yeniden yazar).
 *  - Başka sahibe ait aynı `external_id` (ortak yazarlı/işbirliği gönderisi iki profilde de listelenebilir) YAZILMAZ:
 *    upsert sahibi değiştirir ve iki hesabın baz çizgisini bozardı. Sayısı `skippedOtherOwner`'da raporlanır.
 *  - Ölçüm satırı koşu + içerik başına en çok bir tane (kısmi benzersiz indeks): aynı koşunun yeniden ingest'i
 *    ikinci satır yazmaz (`snapshotsAlreadyWritten`). Kısmi indeks `on conflict` ile çıkarılamadığı için mevcut
 *    ölçümler önce okunur, yalnız eksikler yazılır.
 */
import "server-only";

import {
  toContentRow,
  toSnapshotRow,
  type ContentItemRow,
  type MetricSnapshotRow,
} from "@/lib/collection/content-rows";
import type { NormalizedContent } from "@/lib/platforms/types";
import { chunk } from "@/lib/scoring/batch";
import type { ScoringOwner } from "@/lib/scoring/types";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";

const ROWS_PER_REQUEST = 100;

export interface IngestContentInput {
  workspaceId: string;
  /** İçeriklerin sahibi (kendi hesap ya da rakip). */
  owner: ScoringOwner;
  items: readonly NormalizedContent[];
  collectionRunId: string;
  /** Sahibin bu andaki takipçi sayısı (ölçüm satırına `owner_followers`); bilinmiyorsa yok (NULL). */
  ownerFollowers?: number;
  /** Tek saat: ölçüm anı (`captured_at`). */
  now: Date;
}

export interface IngestContentResult {
  /** Yazılan (eklenen ya da güncellenen) `content_items` satırı. */
  contentItems: number;
  /** Yazılan `metric_snapshots` satırı. */
  snapshots: number;
  /** Bu koşuda zaten ölçümü yazılmış içerik (yeniden ingest). */
  snapshotsAlreadyWritten: number;
  /** Başka sahibe ait olduğu için atlanan içerik. */
  skippedOtherOwner: number;
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`Ingest: ${what} (${error.message}).`);
}

const keyOf = (platform: string, externalId: string) => `${platform}\u0000${externalId}`;

/** Aynı `external_id` bir toplu upsert'te iki kez olamaz ("cannot affect row a second time"): sonuncusu kazanır. */
function dedupe(items: readonly NormalizedContent[]): NormalizedContent[] {
  const byKey = new Map<string, NormalizedContent>();
  for (const item of items) byKey.set(keyOf(item.platform, item.externalId), item);
  return [...byKey.values()];
}

function isOwnedBy(row: { social_account_id: string | null; competitor_id: string | null }, owner: ScoringOwner): boolean {
  return (owner.kind === "own" ? row.social_account_id : row.competitor_id) === owner.id;
}

/** Yazılacak satırlardan, başka sahibe ait olanları ayırır (parça başına tek okuma). */
async function splitByOwnership(
  client: AdminClient,
  workspaceId: string,
  owner: ScoringOwner,
  rows: ContentItemRow[],
): Promise<{ writable: ContentItemRow[]; skipped: number }> {
  const foreign = new Set<string>();
  for (const part of chunk(rows, ROWS_PER_REQUEST)) {
    const { data, error } = await client
      .from("content_items")
      .select("platform, external_id, social_account_id, competitor_id")
      .eq("workspace_id", workspaceId)
      .in("external_id", part.map((row) => row.external_id));
    if (error) fail("mevcut içerikler okunamadı", error);
    for (const row of data ?? []) if (!isOwnedBy(row, owner)) foreign.add(keyOf(row.platform, row.external_id));
  }
  const writable = rows.filter((row) => !foreign.has(keyOf(row.platform, row.external_id)));
  return { writable, skipped: rows.length - writable.length };
}

async function upsertContent(
  client: AdminClient,
  rows: ContentItemRow[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const part of chunk(rows, ROWS_PER_REQUEST)) {
    const { data, error } = await client
      .from("content_items")
      .upsert(part, { onConflict: "workspace_id,platform,external_id" })
      .select("id, platform, external_id");
    if (error) fail("içerikler yazılamadı", error);
    for (const row of data ?? []) ids.set(keyOf(row.platform, row.external_id), row.id);
  }
  return ids;
}

async function writeSnapshots(
  client: AdminClient,
  workspaceId: string,
  collectionRunId: string,
  rows: MetricSnapshotRow[],
): Promise<{ written: number; already: number }> {
  let written = 0;
  let already = 0;
  for (const part of chunk(rows, ROWS_PER_REQUEST)) {
    const existing = await client
      .from("metric_snapshots")
      .select("content_item_id")
      .eq("workspace_id", workspaceId)
      .eq("collection_run_id", collectionRunId)
      .in("content_item_id", part.map((row) => row.content_item_id));
    if (existing.error) fail("mevcut ölçümler okunamadı", existing.error);
    const done = new Set((existing.data ?? []).map((row) => row.content_item_id));
    const fresh = part.filter((row) => !done.has(row.content_item_id));
    already += part.length - fresh.length;
    if (fresh.length === 0) continue;
    const { error } = await client.from("metric_snapshots").insert(fresh);
    if (error) fail("ölçümler yazılamadı", error);
    written += fresh.length;
  }
  return { written, already };
}

export async function ingestContent(
  input: IngestContentInput,
  deps: { client?: AdminClient } = {},
): Promise<IngestContentResult> {
  const { workspaceId, owner, collectionRunId } = input;
  if (input.items.length === 0) return { contentItems: 0, snapshots: 0, snapshotsAlreadyWritten: 0, skippedOtherOwner: 0 };
  const client = deps.client ?? getAdminClient();
  const capturedAt = input.now.toISOString();

  const items = dedupe(input.items);
  const rows = items.map((item) => toContentRow(item, owner, workspaceId));
  const { writable, skipped } = await splitByOwnership(client, workspaceId, owner, rows);
  const writableKeys = new Set(writable.map((row) => keyOf(row.platform, row.external_id)));
  const ids = await upsertContent(client, writable);

  const snapshotRows: MetricSnapshotRow[] = [];
  for (const item of items) {
    const key = keyOf(item.platform, item.externalId);
    const contentItemId = ids.get(key);
    if (!writableKeys.has(key) || !contentItemId) continue;
    snapshotRows.push(
      toSnapshotRow(item, {
        workspaceId,
        contentItemId,
        collectionRunId,
        capturedAt,
        ownerFollowers: input.ownerFollowers,
      }),
    );
  }
  const snapshots = await writeSnapshots(client, workspaceId, collectionRunId, snapshotRows);

  return {
    contentItems: writable.length,
    snapshots: snapshots.written,
    snapshotsAlreadyWritten: snapshots.already,
    skippedOtherOwner: skipped,
  };
}
