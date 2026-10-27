/**
 * Plan taslağının içerik havuzu: ham `items` bir kez süzülür ve zenginleştirilir, sonraki bölümler (tutanlar, yönler, kaçın,
 * adaylar, takvim) aynı havuzdan okur. Kurallar:
 *  - Yalnız kısa video, tarihi geçerli ve `now`dan eski (gelecek tarihli yok); kendi hesap (kapsam `accountId`) ve İZLENEN rakip.
 *  - Niş dışı içerik (`offNicheContentIds`) `own`/`rivals`'tan ÇIKAR (ondan öğrenilmez) ama `offNiche` ve `allOwn`/`allRivals`'ta
 *    kalır: paylaşım sıklığı/saati davranıştır, niş dışı olması onu değiştirmez.
 *  - Lift = `usableLift` (ölçülmüş VE olgun); olgunlaşmamış/ölçülemeyen içerikte undefined (0 değil).
 *  - Hook türü yalnız doğrulanmış (`status = ok`, `evidenceVerified`) analizden gelir.
 */
import type { ContentItem } from "@/lib/domain/content";
import { durationBucketOf, type CtaType, type DurationBucket } from "@/lib/domain/taxonomy";
import { classifyCta } from "@/lib/data/views/insights-cta";
import { usableLift } from "@/lib/data/views/insights-groups";
import { verifiedHookTypeById } from "@/lib/data/views/insights-hooks";
import { audienceZone } from "@/lib/insights/audience-zone";
import type { PlanDraftInput } from "@/lib/insights/types";
import { DAY_MS } from "@/lib/time";

export interface PoolCluster {
  id: string;
  label: string;
}

export interface PoolItem {
  item: ContentItem;
  /** Yayın anı (ms). */
  at: number;
  isOwn: boolean;
  /** Ölçülmüş ve olgun lift; aksi halde undefined. */
  lift?: number;
  /** Baz çizgisi düşük güvenli mi (`score.lowConfidence`): grup güveni tavanı için (`capConfidenceForBaseline`). */
  lowBaseline: boolean;
  /** Doğrulanmış analizdeki hook türü. */
  hookType?: string;
  /** Analiz `ok` ama alıntı denetimi geçmedi: etiket kullanılmaz, metin "kanıt doğrulanamadı" der ("henüz analiz edilmedi" değil). */
  evidenceUnverified: boolean;
  bucket?: DurationBucket;
  cta?: CtaType;
  clusters: PoolCluster[];
}

export interface Pool {
  nowMs: number;
  zone: string;
  /** Niş içi (öğrenmeye girenler). */
  own: PoolItem[];
  rivals: PoolItem[];
  /** Niş dışı elenenler (kendi + rakip). */
  offNiche: PoolItem[];
  /** Niş dışı dahil, davranış (sıklık/saat) analizi için. */
  allOwn: PoolItem[];
  allRivals: PoolItem[];
  /** Konu eleğinden geçen içerik kimlikleri (niş içi + dışı); verilmediyse undefined ("kaç video elendi" bilinmez). */
  screenedIds?: ReadonlySet<string>;
}

/** Sahip kimliğine göre gruplar (girdi sırası korunur). */
export function groupByOwner(items: readonly PoolItem[]): Map<string, PoolItem[]> {
  const map = new Map<string, PoolItem[]>();
  for (const pi of items) map.set(pi.item.owner.id, [...(map.get(pi.item.owner.id) ?? []), pi]);
  return map;
}

export const withinDays =(pi: PoolItem, nowMs: number, days: number): boolean => pi.at >= nowMs - days * DAY_MS;

export function buildPool(input: PlanDraftInput): Pool {
  const nowMs = input.now.getTime();
  const ownIds = new Set(input.own.filter((a) => input.accountId === undefined || a.id === input.accountId).map((a) => a.id));
  const rivalIds = new Set(input.competitors.filter((c) => c.status === "tracked").map((c) => c.id));

  const hookTypeById = verifiedHookTypeById(input.analyses);
  const unverifiedIds = new Set((input.analyses ?? []).filter((a) => a.status === "ok" && !a.evidenceVerified).map((a) => a.contentItemId));
  const clustersById = new Map<string, PoolCluster[]>();
  for (const cluster of input.clusters ?? []) {
    for (const id of cluster.contentItemIds) clustersById.set(id, [...(clustersById.get(id) ?? []), { id: cluster.id, label: cluster.label }]);
  }
  const offNicheIds = new Set(input.offNicheContentIds ?? []);

  const pool: Pool = {
    nowMs,
    zone: audienceZone(input.workspace),
    own: [],
    rivals: [],
    offNiche: [],
    allOwn: [],
    allRivals: [],
    screenedIds: input.screenedContentIds === undefined ? undefined : new Set(input.screenedContentIds),
  };
  const seen = new Set<string>();
  for (const item of input.items) {
    if (item.format !== "short_video" || seen.has(item.id)) continue;
    const at = item.publishedAt === undefined ? Number.NaN : Date.parse(item.publishedAt);
    if (Number.isNaN(at) || at > nowMs) continue;
    const isOwn = item.owner.kind === "own";
    if (!(isOwn ? ownIds.has(item.owner.id) : rivalIds.has(item.owner.id))) continue;
    seen.add(item.id);
    const bucket = durationBucketOf(item.durationSec);
    const entry: PoolItem = { item, at, isOwn, lift: usableLift(item), lowBaseline: item.score.lowConfidence, hookType: hookTypeById.get(item.id), evidenceUnverified: unverifiedIds.has(item.id), bucket, cta: classifyCta(item.caption), clusters: clustersById.get(item.id) ?? [] };
    (isOwn ? pool.allOwn : pool.allRivals).push(entry);
    if (offNicheIds.has(item.id)) pool.offNiche.push(entry);
    else (isOwn ? pool.own : pool.rivals).push(entry);
  }
  return pool;
}
