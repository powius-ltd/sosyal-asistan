/**
 * Profil ingest'i (yalnız sunucu, service role): `NormalizedProfile` → `account_snapshots` (takipçi/takip/gönderi
 * sayısı zaman serisi) + sahip satırının (kendi hesap / rakip) kimlik ve sayaç güncellemesi.
 *
 * Erişim hatası (rakip): `markCompetitorAccess` yalnız `tracked` rakibi `private`/`not_found` yapar (yoksayılmış ya da
 * aday rakibin durumu koşudan etkilenmez) ve kısa sebebi `competitors.status_reason`'a yazar (0007; ekranda "neden gizli?").
 * Kendi hesapta erişim hatası DB'yi değiştirmez; çağıran raporlar.
 *
 * Keşif kancası: kendi hesabın profilindeki "ilgili hesaplar" rakip ADAYI olarak yazılır (`discover-write.ts` `writeRelatedCandidates`;
 * `candidate`, izlemeye alınmaz, yalnız kullanıcı adı). Kanca fırlatmaz ve sonucu değiştirmez.
 */
import "server-only";

import { ownerKey } from "@/lib/collection/content-rows";
import { writeRelatedCandidates } from "@/lib/collection/discover-write";
import {
  toAccountSnapshotRow,
  toCompetitorPatch,
  toSocialAccountPatch,
  type AccountSnapshotRow,
} from "@/lib/collection/profile-rows";
import type { NormalizedProfile } from "@/lib/platforms/types";
import type { ScoringOwner } from "@/lib/scoring/types";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";

export interface ProfileEntry {
  owner: ScoringOwner;
  profile: NormalizedProfile;
}

export interface IngestProfilesInput {
  workspaceId: string;
  collectionRunId: string;
  entries: readonly ProfileEntry[];
  /** Tek saat: ölçüm anı. */
  now: Date;
}

export interface IngestProfilesResult {
  /** Yazılan `account_snapshots` satırı. */
  snapshots: number;
  /** Bu koşuda zaten yazılmış ölçüm (yeniden ingest). */
  snapshotsAlreadyWritten: number;
  /** Kimlik/sayaç güncellenen sahip sayısı. */
  ownersUpdated: number;
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`Ingest: ${what} (${error.message}).`);
}

export async function ingestProfiles(
  input: IngestProfilesInput,
  deps: { client?: AdminClient } = {},
): Promise<IngestProfilesResult> {
  const { workspaceId, collectionRunId } = input;
  if (input.entries.length === 0) return { snapshots: 0, snapshotsAlreadyWritten: 0, ownersUpdated: 0 };
  const client = deps.client ?? getAdminClient();
  const capturedAt = input.now.toISOString();

  // Bu koşunun mevcut ölçümleri (kısmi benzersiz indeks `on conflict` ile çıkarılamaz): tek okuma.
  const existing = await client
    .from("account_snapshots")
    .select("social_account_id, competitor_id")
    .eq("workspace_id", workspaceId)
    .eq("collection_run_id", collectionRunId);
  if (existing.error) fail("mevcut hesap ölçümleri okunamadı", existing.error);
  const done = new Set(
    (existing.data ?? []).map((row) =>
      row.social_account_id
        ? ownerKey({ kind: "own", id: row.social_account_id })
        : ownerKey({ kind: "competitor", id: row.competitor_id ?? "" }),
    ),
  );

  const rows: AccountSnapshotRow[] = [];
  for (const entry of input.entries) {
    if (done.has(ownerKey(entry.owner))) continue;
    rows.push(toAccountSnapshotRow(entry.profile, entry.owner, { workspaceId, collectionRunId, capturedAt }));
  }
  if (rows.length > 0) {
    const { error } = await client.from("account_snapshots").insert(rows);
    if (error) fail("hesap ölçümleri yazılamadı", error);
  }

  // Sahip güncellemeleri: her sahibin değerleri farklıdır (hedef sayısı kadar küçük istek).
  let ownersUpdated = 0;
  for (const { owner, profile } of input.entries) {
    const query =
      owner.kind === "own"
        ? client.from("social_accounts").update(toSocialAccountPatch(profile, capturedAt))
        : client.from("competitors").update(toCompetitorPatch(profile, capturedAt));
    const { error } = await query.eq("id", owner.id).eq("workspace_id", workspaceId);
    if (error) fail("sahip satırı güncellenemedi", error);
    ownersUpdated += 1;
  }

  // Keşif kancası: kendi hesabın profilindeki "ilgili hesaplar" rakip ADAYI yazılır (izlemeye alınmaz, para harcamaz, hata toplamayı düşürmez).
  await writeRelatedCandidates({ client, workspaceId, entries: input.entries });

  return {
    snapshots: rows.length,
    snapshotsAlreadyWritten: input.entries.length - rows.length,
    ownersUpdated,
  };
}

/** `competitors.status_reason` üst sınırı (şema check'i 300 karakter). */
export const STATUS_REASON_MAX = 300;

/**
 * Erişim hatası: `tracked` rakibi `private` / `not_found` yapar (başka durumdaki rakibe dokunmaz) ve kısa sebebi
 * `status_reason`'a yazar (verilmezse durumun varsayılan sebep metni). Değişiklik uygulandıysa `true`.
 */
export async function markCompetitorAccess(
  input: { workspaceId: string; competitorId: string; state: "private" | "not_found"; reason?: string },
  deps: { client?: AdminClient } = {},
): Promise<boolean> {
  const client = deps.client ?? getAdminClient();
  const fallback = input.state === "private" ? "hesap gizli" : "hesap bulunamadı";
  const reason = (input.reason?.replace(/\s+/g, " ").trim() || fallback).slice(0, STATUS_REASON_MAX);
  const { data, error } = await client
    .from("competitors")
    .update({ status: input.state, status_reason: reason })
    .eq("id", input.competitorId)
    .eq("workspace_id", input.workspaceId)
    .eq("status", "tracked")
    .select("id");
  if (error) fail("rakip durumu güncellenemedi", error);
  return (data?.length ?? 0) > 0;
}
