/**
 * Mock depo: filtre / sıralama / sayfalama (saf fonksiyonlar). `queries.ts` kurallarını uygular:
 * verilmeyen alan = filtre yok; `limit` varsayılan 50, üst sınır 200; `cursor` opak (başlangıç
 * indeksi); sıralamada ölçülemeyen (undefined) değerler en sona düşer.
 */
import type { Competitor, DiscoveryCandidateView, OwnAccount } from "@/lib/domain/competitor";
import { OUTLIER_MIN_TIER, type ContentItem } from "@/lib/domain/content";
import type { Idea } from "@/lib/domain/intel";
import type { PublishJob } from "@/lib/domain/publish";
import type { CollectionRun } from "@/lib/domain/run";
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  type CompetitorFilter,
  type ContentFilter,
  type DiscoveryFilter,
  type IdeaFilter,
  type OutlierFilter,
  type PagedResult,
  type PublishJobFilter,
  type RunFilter,
} from "@/lib/data/queries";
import { similarSize } from "@/lib/metrics/cross-account";
import { foldTurkish } from "@/lib/text";

export function toArray<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

export function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(Math.floor(limit ?? DEFAULT_PAGE_LIMIT), 1), MAX_PAGE_LIMIT);
}

export function paginate<T>(items: T[], limit: number | undefined, cursor: string | undefined): PagedResult<T> {
  const size = clampLimit(limit);
  const start = cursor ? Math.max(Number.parseInt(cursor, 10) || 0, 0) : 0;
  const next = start + size;
  return {
    items: items.slice(start, next),
    total: items.length,
    ...(next < items.length ? { nextCursor: String(next) } : {}),
  };
}

/** Azalan karşılaştırma; undefined en sona (ölçülemeyen "en kötü" değil, "bilinmiyor"). */
export function compareDescending(x: number | undefined, y: number | undefined): number {
  if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1;
  return y - x;
}

function descBy<T>(items: T[], pick: (item: T) => number | undefined): T[] {
  return [...items].sort((a, b) => compareDescending(pick(a), pick(b)));
}

const time = (iso: string | undefined) => (iso ? new Date(iso).getTime() : undefined);
/** Arama katlaması (`foldTurkish`): ASCII handle "VERIMLI" ile "verimli", "isik" ile "ışık" eşleşir. */
export const fold = foldTurkish;

export function filterContent(items: ContentItem[], f: ContentFilter = {}): ContentItem[] {
  const search = f.search?.trim() ? fold(f.search.trim()) : undefined;
  const since = time(f.since);
  const out = items.filter((c) => {
    if (f.platform && c.platform !== f.platform) return false;
    if (f.format && c.format !== f.format) return false;
    if (f.ownerKind && c.owner.kind !== f.ownerKind) return false;
    if (f.ownerId && c.owner.id !== f.ownerId) return false;
    if (f.minTier !== undefined && (c.score.liftTier === undefined || c.score.liftTier < f.minTier)) return false;
    if (since !== undefined && (time(c.publishedAt) ?? -Infinity) < since) return false;
    if (f.hideLowConfidence && c.score.lowConfidence) return false;
    if (f.hideImmature && c.score.immature) return false;
    if (search) {
      const hay = fold(`${c.caption ?? ""} ${c.owner.handle} ${c.owner.displayName ?? ""} ${c.hashtags.join(" ")}`);
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  switch (f.sort ?? "recent") {
    case "lift":
      return descBy(out, (c) => c.score.lift);
    case "views":
      return descBy(out, (c) => c.metrics.views);
    default:
      return descBy(out, (c) => time(c.publishedAt));
  }
}

/**
 * Takipçi, aynı platformdaki kendi hesaplardan birinin ±3x aralığında mı (`lib/metrics` `similarSize`; kural tek yerde).
 * true: en az bir kendi hesapla benzer · false: karşılaştırılabilen hesapların hiçbiriyle benzer değil ·
 * undefined: karşılaştırılamadı (takipçi bilinmiyor ya da 0, aynı platformda takipçisi bilinen kendi hesap yok).
 * Takipçi 0 "benzer değil" değil "bilinmiyor"dur (oran tanımsız); `similarSizeOnly` süzgeci yalnız `true`'yu tutar.
 */
export function isSimilarSize(
  followers: number | undefined,
  platform: Competitor["platform"],
  own: OwnAccount[],
): boolean | undefined {
  const verdicts = own.filter((a) => a.platform === platform).map((a) => similarSize(a.followers, followers));
  if (verdicts.includes(true)) return true;
  return verdicts.includes(false) ? false : undefined;
}

/**
 * Tutan içerikler: yalnız İZLENEN (`tracked`) rakiplerin içerikleri. `ignored`, `candidate`, `private` ve `not_found`
 * rakiplerin içerikleri çıkmaz (yoksaydığın ya da izlemediğin hesap tutanlar listesini kirletmez).
 */
export function filterOutliers(
  items: ContentItem[],
  f: OutlierFilter,
  own: OwnAccount[],
  competitors: Competitor[],
): ContentItem[] {
  const trackedIds = new Set(competitors.filter((c) => c.status === "tracked").map((c) => c.id));
  const tracked = items.filter((c) => c.owner.kind === "competitor" && trackedIds.has(c.owner.id));
  const base = filterContent(tracked, {
    platform: f.platform,
    format: f.format,
    ownerKind: "competitor",
    ownerId: f.competitorId,
    minTier: f.minTier ?? OUTLIER_MIN_TIER,
    since: f.since,
    hideLowConfidence: f.hideLowConfidence,
    hideImmature: f.hideImmature,
  }).filter((c) => !f.similarSizeOnly || isSimilarSize(c.owner.followers, c.platform, own) === true);

  switch (f.sort ?? "lift") {
    case "cross":
      return descBy(base, (c) => c.score.crossScore);
    case "recent":
      return descBy(base, (c) => time(c.publishedAt));
    default:
      return descBy(base, (c) => c.score.lift);
  }
}

export function filterCompetitors(items: Competitor[], f: CompetitorFilter = {}): Competitor[] {
  const statuses = toArray(f.status);
  const search = f.search?.trim() ? fold(f.search.trim()) : undefined;
  return items.filter((c) => {
    if (f.platform && c.platform !== f.platform) return false;
    if (statuses && !statuses.includes(c.status)) return false;
    if (f.source && c.source !== f.source) return false;
    if (search && !fold(`${c.handle} ${c.displayName ?? ""}`).includes(search)) return false;
    return true;
  });
}

export function discoveryViews(competitors: Competitor[], own: OwnAccount[], f: DiscoveryFilter = {}): DiscoveryCandidateView[] {
  const views: DiscoveryCandidateView[] = [];
  for (const c of competitors) {
    if (c.status !== "candidate" || c.source === "manual") continue;
    if (f.platform && c.platform !== f.platform) continue;
    if (f.source && c.source !== f.source) continue;
    const similarSize = isSimilarSize(c.followers, c.platform, own);
    if (f.similarSizeOnly && similarSize !== true) continue;
    views.push({
      competitorId: c.id,
      platform: c.platform,
      handle: c.handle,
      displayName: c.displayName,
      followers: c.followers,
      source: c.source,
      via: c.discoveredVia,
      similarSize,
      discoveredAt: c.addedAt,
    });
  }
  views.sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt));
  return views.slice(0, clampLimit(f.limit));
}

export function filterIdeas(items: Idea[], f: IdeaFilter = {}): Idea[] {
  const statuses = toArray(f.status);
  return items
    .filter((i) => (!statuses || statuses.includes(i.status)) && (!f.platform || i.platform === f.platform))
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, clampLimit(f.limit));
}

/** Takvim anahtarı: planlanan zaman, yoksa oluşturma zamanı. */
const jobKey = (j: PublishJob) => time(j.scheduledFor ?? j.createdAt) ?? 0;

export function filterPublishJobs(items: PublishJob[], f: PublishJobFilter = {}): PublishJob[] {
  const statuses = toArray(f.status);
  const from = time(f.from);
  const to = time(f.to);
  return items
    .filter((j) => !statuses || statuses.includes(j.status))
    .filter((j) => !f.socialAccountId || j.socialAccountId === f.socialAccountId)
    .filter((j) => (from === undefined || jobKey(j) >= from) && (to === undefined || jobKey(j) <= to))
    .sort((a, b) => jobKey(b) - jobKey(a))
    .slice(0, clampLimit(f.limit));
}

export function filterRuns(items: CollectionRun[], f: RunFilter = {}): CollectionRun[] {
  const statuses = toArray(f.status);
  const since = time(f.since);
  return items
    .filter((r) => !f.provider || r.provider === f.provider)
    .filter((r) => !statuses || statuses.includes(r.status))
    .filter((r) => since === undefined || (time(r.startedAt) ?? 0) >= since)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
