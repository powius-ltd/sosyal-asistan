/**
 * İçerik süzgeçleri (`ContentFilter` / `OutlierFilter` ortak parçası) ve arama çözümü. Süzgeçler PostgREST filtre
 * zincirine uygulanır: satır sorgusu ve `count` sorgusu AYNI süzgeci kullanır (toplam = sayfalanan küme).
 */
import type { LiftTier } from "@/lib/domain/content";
import type { ContentFilter } from "@/lib/data/queries";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { filterValue } from "@/lib/data/supabase/cursor";
import { fetchCompetitorRows } from "@/lib/data/supabase/competitor-rows";
import { listOwnAccounts } from "@/lib/data/supabase/workspace";
import { foldTurkish } from "@/lib/text";

/**
 * Filtre zincirinin yapısal görünümü. Yöntemler `this` döndürür: çağıranın somut builder tipi (satır ya da `count`
 * sorgusu) korunur, süzgeç uygulayan fonksiyonlar tek yerde durur.
 */
export interface Filterable {
  eq(column: string, value: string | number | boolean): this;
  gte(column: string, value: string | number): this;
  lte(column: string, value: string | number): this;
  in(column: string, values: readonly (string | number)[]): this;
  is(column: string, value: null | boolean): this;
  not(column: string, operator: string, value: unknown): this;
  or(filters: string): this;
}

/** Aramada owner eşleşmesi için üst sınır (URL uzunluğu): aşan sahip listesi kırpılır. */
const SEARCH_OWNER_LIMIT = 200;

export interface ResolvedSearch {
  /** `caption` için `ilike` desenleri (kaçışlı, `%…%`). */
  captionPatterns: string[];
  /** Adı/görünen adı aramaya uyan kendi hesap ve rakip kimlikleri. */
  ownIds: string[];
  competitorIds: string[];
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

/**
 * Arama: alt yazı `ilike` ile (kullanıcının yazdığı hâl + Türkçe katlanmış hâl), sahip adı/görünen adı Türkçe katlamayla
 * (`foldTurkish`: "VERIMLI" ↔ "verimli", "isik" ↔ "ışık") TS'te eşlenir. Boş arama → undefined (süzgeç yok).
 * Sapma (mock ile): alt yazıdaki aksan katlaması DB'de yoktur (`ilike` yalnız harf büyüklüğünü katlar).
 */
export async function resolveSearch(ctx: SupabaseContext, wsId: string, search: string | undefined): Promise<ResolvedSearch | undefined> {
  const raw = search?.trim();
  if (!raw) return undefined;
  const folded = foldTurkish(raw);
  const [own, competitors] = await Promise.all([listOwnAccounts(ctx, wsId), fetchCompetitorRows(ctx, wsId)]);
  const matches = (row: { handle: string; displayName?: string | null; display_name?: string | null }) =>
    foldTurkish(`${row.handle} ${row.displayName ?? row.display_name ?? ""}`).includes(folded);
  const patterns = new Set([`%${escapeLike(raw)}%`, `%${escapeLike(folded)}%`]);
  return {
    captionPatterns: [...patterns],
    ownIds: own.filter(matches).map((r) => r.id).slice(0, SEARCH_OWNER_LIMIT),
    competitorIds: competitors.filter(matches).map((r) => r.id).slice(0, SEARCH_OWNER_LIMIT),
  };
}

function searchClause(search: ResolvedSearch): string {
  const parts = search.captionPatterns.map((pattern) => `caption.ilike.${filterValue(pattern)}`);
  if (search.ownIds.length > 0) parts.push(`social_account_id.in.(${search.ownIds.join(",")})`);
  if (search.competitorIds.length > 0) parts.push(`competitor_id.in.(${search.competitorIds.join(",")})`);
  return parts.join(",");
}

export interface SharedContentFilter {
  platform?: ContentFilter["platform"];
  format?: ContentFilter["format"];
  minTier?: LiftTier;
  since?: string;
  hideLowConfidence?: boolean;
  hideImmature?: boolean;
}

/** Platform, format, kademe, tarih, düşük güven ve olgunluk süzgeçleri (içerik ve tutan listeleri ortak). */
export function applySharedContentFilters<Q extends Filterable>(query: Q, f: SharedContentFilter): Q {
  let q = query;
  if (f.platform) q = q.eq("platform", f.platform);
  if (f.format) q = q.eq("format", f.format);
  // `lift_tier >= n` NULL'ı (ölçülemedi) dışlar: mock'ta `liftTier === undefined` süzülür.
  if (f.minTier !== undefined) q = q.gte("lift_tier", f.minTier);
  if (f.since) q = q.gte("published_at", f.since);
  if (f.hideLowConfidence) q = q.eq("low_confidence", false);
  if (f.hideImmature) q = q.eq("immature", false);
  return q;
}

/** `listContent` süzgeçleri (ortak parçalar + sahip türü/kimliği + arama). `ownerId` çağıranca UUID doğrulanmış olmalı. */
export function applyContentFilters<Q extends Filterable>(query: Q, f: ContentFilter, search: ResolvedSearch | undefined): Q {
  let q = applySharedContentFilters(query, f);
  if (f.ownerKind === "own") q = q.not("social_account_id", "is", null);
  if (f.ownerKind === "competitor") q = q.not("competitor_id", "is", null);
  if (f.ownerId) q = q.or(`social_account_id.eq.${f.ownerId},competitor_id.eq.${f.ownerId}`);
  if (search) q = q.or(searchClause(search));
  return q;
}
