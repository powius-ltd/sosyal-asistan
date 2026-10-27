/**
 * Hook kütüphanesi: ayrı tablo YOK — `content_analyses` ⨝ `content_items` görünümü. Kapsam: yalnız `ok` + kanıtı
 * doğrulanmış analizler; sahibi kendi hesap ya da İZLENEN (`tracked`) rakip (Tutanlar ile aynı kural). Hook metni
 * transcript'ten birebir alıntıdır (transcript süresi dolsa da kalır). Arama `search_key` (uygulamanın `foldTurkish` ile
 * yazdığı anahtar; `pg_trgm` indeksi) üzerinde `ilike` ile yapılır. Kütüphane bir workspace'te onlarca-yüzlerce satırdır:
 * kapsam DB'de, sıralama/imleç TS'te (deterministik toplam sıra; ölçülemeyen lift sonda) yapılır.
 */
import type { LiftTier } from "@/lib/domain/content";
import type { HookLibraryEntry, HookTypeStat } from "@/lib/domain/hook-library";
import type { HookLibraryFilter, PagedResult } from "@/lib/data/queries";
import { RepositoryError } from "@/lib/data/repository";
import { median } from "@/lib/metrics/stats";
import { foldTurkish } from "@/lib/text";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { decodeCursor, encodeCursor } from "@/lib/data/supabase/cursor";
import { isUuid } from "@/lib/data/supabase/errors";
import { firstOf, iso, opt } from "@/lib/data/supabase/mappers/common";
import { hookSourceOf, liftTierOf } from "@/lib/data/supabase/mappers/enums";
import { clampLimit, fetchAllRows } from "@/lib/data/supabase/paging";

type Owned<T> = T | T[] | null;

interface ContentPart {
  platform: HookLibraryEntry["platform"];
  published_at: string | null;
  lift: number | null;
  lift_tier: number | null;
  social_account_id: string | null;
  social_accounts: Owned<{ handle: string }>;
  competitors: Owned<{ handle: string; status: string }>;
  transcripts: Owned<{ language: string | null }>;
}

interface HookRow {
  content_item_id: string;
  hook_text: string | null;
  hook_source: string | null;
  hook_type: string | null;
  hook_type_evidence: string | null;
  content_items: Owned<ContentPart>;
}

const SELECT =
  "content_item_id, hook_text, hook_source, hook_type, hook_type_evidence, content_items!inner(platform, published_at, lift, lift_tier, social_account_id, social_accounts(handle), competitors(handle, status), transcripts(language))";

const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

function toEntry(row: HookRow): HookLibraryEntry | undefined {
  const content = firstOf(row.content_items);
  if (!content || !row.hook_text || !row.hook_type) return undefined;
  const isOwn = content.social_account_id !== null;
  const competitor = firstOf(content.competitors);
  if (!isOwn && competitor?.status !== "tracked") return undefined; // yoksayılan/aday/gizli rakip girişi kirletmez
  const owner = isOwn ? firstOf(content.social_accounts) : competitor;
  if (!owner) return undefined;
  const tier: LiftTier | undefined = liftTierOf(content.lift_tier);
  return {
    contentId: row.content_item_id,
    hookText: row.hook_text,
    hookSource: row.hook_source === null ? undefined : hookSourceOf(row.hook_source),
    hookType: row.hook_type,
    hookTypeEvidence: opt(row.hook_type_evidence),
    ownerHandle: owner.handle,
    platform: content.platform,
    isOwn,
    lift: opt(content.lift),
    liftTier: tier,
    language: opt(firstOf(content.transcripts)?.language),
    publishedAt: content.published_at === null ? undefined : iso(content.published_at),
  };
}

async function loadEntries(ctx: SupabaseContext, wsId: string, options: { hookType?: string; q?: string } = {}): Promise<HookLibraryEntry[]> {
  const q = options.q?.trim() ? foldTurkish(options.q.trim()) : undefined;
  const rows = await fetchAllRows((from, to) => {
    let query = ctx.db
      .from("content_analyses")
      .select(SELECT)
      .eq("workspace_id", wsId)
      .eq("status", "ok")
      .eq("evidence_verified", true)
      .not("hook_text", "is", null)
      .not("hook_type", "is", null);
    if (options.hookType !== undefined) query = query.eq("hook_type", options.hookType);
    if (q) query = query.ilike("search_key", `%${escapeLike(q)}%`);
    return query.order("content_item_id", { ascending: true }).range(from, to).overrideTypes<HookRow[], { merge: false }>();
  });
  return rows.flatMap((row) => {
    const entry = toEntry(row);
    return entry ? [entry] : [];
  });
}

/** Azalan karşılaştırma; ölçülemeyen (null) en sona. */
function descNullsLast(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

type Sort = "lift" | "recent";
/** Sıralama anahtarı: [lift (yalnız "lift" sırasında), yayın zamanı (ms), kimlik]. */
type Key = [number | null, number | null, string];

function keyOf(sort: Sort, e: HookLibraryEntry): Key {
  return [sort === "lift" ? (e.lift ?? null) : null, e.publishedAt === undefined ? null : new Date(e.publishedAt).getTime(), e.contentId];
}

function compareKeys(a: Key, b: Key): number {
  return descNullsLast(a[0], b[0]) || descNullsLast(a[1], b[1]) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);
}

export async function listHookLibrary(ctx: SupabaseContext, wsId: string, filter: HookLibraryFilter = {}): Promise<PagedResult<HookLibraryEntry>> {
  if (!isUuid(wsId)) return { items: [], total: 0 };
  const sort: Sort = filter.sort === "recent" ? "recent" : "lift";
  const limit = clampLimit(filter.limit);
  const matched = (await loadEntries(ctx, wsId, { hookType: filter.hookType, q: filter.q }))
    .filter((e) => filter.minTier === undefined || (e.liftTier !== undefined && e.liftTier >= filter.minTier))
    .filter((e) => filter.own === undefined || e.isOwn === filter.own)
    .sort((a, b) => compareKeys(keyOf(sort, a), keyOf(sort, b)));

  const tag = `hooks:${sort}`;
  let start = 0;
  if (filter.cursor) {
    const [lift, publishedMs, contentId] = decodeCursor(filter.cursor, tag, 3);
    if ((lift !== null && typeof lift !== "number") || (publishedMs !== null && typeof publishedMs !== "number") || typeof contentId !== "string") {
      throw new RepositoryError("invalid_input", "Geçersiz sayfa imleci.");
    }
    const after: Key = [lift, publishedMs, contentId];
    start = matched.findIndex((e) => compareKeys(keyOf(sort, e), after) > 0);
    if (start < 0) start = matched.length;
  }
  const items = matched.slice(start, start + limit);
  const last = items[items.length - 1];
  const hasMore = start + limit < matched.length;
  return { items, total: matched.length, ...(hasMore && last ? { nextCursor: encodeCursor(tag, keyOf(sort, last)) } : {}) };
}

/** Hook türü başına giriş sayısı ve medyan lift (kütüphanenin tamamı; süzgeçsiz). Sıra: medyan lift azalan (ölçülemeyen sona), sayı azalan, tür adı. */
export async function hookTypeStats(ctx: SupabaseContext, wsId: string): Promise<HookTypeStat[]> {
  if (!isUuid(wsId)) return [];
  const byType = new Map<string, HookLibraryEntry[]>();
  for (const e of await loadEntries(ctx, wsId)) byType.set(e.hookType, [...(byType.get(e.hookType) ?? []), e]);
  const stats: HookTypeStat[] = [...byType].map(([hookType, group]) => ({
    hookType,
    count: group.length,
    medianLift: median(group.flatMap((e) => (e.lift === undefined ? [] : [e.lift]))),
  }));
  return stats.sort((a, b) => descNullsLast(a.medianLift ?? null, b.medianLift ?? null) || b.count - a.count || a.hookType.localeCompare(b.hookType));
}
