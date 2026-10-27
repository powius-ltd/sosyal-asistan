/**
 * Mock üreteci: metrik modeli.
 *  - İçeriğin "olgun" değerleri (`ItemTruth`) + büyüme eğrisi → her an için metrik.
 *    Eğri: ilk günlerde hızlı, sonra yavaş (3. günde ~%73, 14. günde ~%94).
 *  - Snapshot zamanları: yayından sonra sıklaşan, sonra seyrelen takvim + son toplama anı.
 *  - Hesap takipçi snapshot'ları (kendi hesap günlük, rakip haftalık; arada ölçülemeyen günler).
 *
 * Kural: kaynağın vermediği alan hiç yazılmaz (undefined) — 0 yalnız "ölçtük, sıfır".
 */
import type { AccountSnapshot, MetricSnapshot } from "@/lib/domain/content";
import type { ContentFormat, NormalizedMetrics, ViewsKind } from "@/lib/platforms/types";
import type { AccountPlan } from "@/lib/data/mock/generators/accounts";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import { DAY_MS } from "@/lib/time";
import type { Rng } from "@/lib/data/mock/prng";

/** Sayılan metrik alanları (missingFields bu adları kullanır). */
export const METRIC_FIELDS = ["views", "likes", "comments", "shares", "saves", "reach", "avgWatchSec"] as const;
export type MetricField = (typeof METRIC_FIELDS)[number];

/** Olgun (büyümesi bitmiş) değerler. undefined = kaynak bu alanı vermiyor/gizli. */
export interface ItemTruth {
  views?: number;
  viewsKind?: ViewsKind;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  /** Erişim/izlenme oranı (views × reachRate). */
  reachRate?: number;
  avgWatchSec?: number;
}

/** Yayından `ageDays` sonra olgun değerin ne kadarına ulaşıldığı (0..1, artan). */
export function growthCurve(ageDays: number): number {
  if (ageDays <= 0) return 0;
  return Math.max(0, 1 - 0.82 * Math.exp(-ageDays / 1.6) - 0.18 * Math.exp(-ageDays / 12));
}

/** Olgun değerlerden verilen büyüme oranındaki metrikler (tekdüze artan: aynı oran, yuvarlama). */
export function metricsAt(truth: ItemTruth, g: number): NormalizedMetrics {
  const scale = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * g));
  const views = scale(truth.views);
  const metrics: NormalizedMetrics = { extra: {} };
  if (views !== undefined) {
    metrics.views = views;
    metrics.viewsKind = truth.viewsKind;
  }
  const likes = scale(truth.likes);
  const comments = scale(truth.comments);
  const shares = scale(truth.shares);
  const saves = scale(truth.saves);
  if (likes !== undefined) metrics.likes = likes;
  if (comments !== undefined) metrics.comments = comments;
  if (shares !== undefined) metrics.shares = shares;
  if (saves !== undefined) metrics.saves = saves;
  if (truth.reachRate !== undefined && views !== undefined) metrics.reach = Math.round(views * truth.reachRate);
  if (truth.avgWatchSec !== undefined) metrics.avgWatchSec = truth.avgWatchSec;
  return metrics;
}

export const isVideoFormat = (format: ContentFormat) => format === "short_video" || format === "long_video";

/** Ölçülemeyen alanlar: izlenme süresi video olmayan formatta "uygulanamaz", listeye girmez. */
export function missingFieldsOf(metrics: NormalizedMetrics, format: ContentFormat): string[] {
  return METRIC_FIELDS.filter((f) => metrics[f] === undefined && (f !== "avgWatchSec" || isVideoFormat(format)));
}

interface TruthInput {
  plan: AccountPlan;
  format: ContentFormat;
  /** Olgun izlenme (izlenmesi ölçülemeyen format için undefined). */
  views?: number;
  viewsKind?: ViewsKind;
  durationSec?: number;
  ageDays: number;
}

/** Kaynağa göre hangi alanların geldiği: resmi API hepsini, kazıma yalnız herkese açık sayıları verir. */
export function buildTruth(rng: Rng, input: TruthInput): ItemTruth {
  const { plan, format, views } = input;
  const likeBase = views ?? plan.followersNow * rng.float(0.35, 0.9);
  const likes = likeBase * rng.float(0.022, 0.06);
  const truth: ItemTruth = {
    views,
    viewsKind: views === undefined ? undefined : input.viewsKind,
    likes,
    comments: likes * rng.float(0.008, 0.05),
  };

  if (plan.ownerKind === "competitor") {
    // Herkese açık kazıma: shares/saves/reach/izlenme süresi YOK; bazı hesaplar beğeniyi gizler.
    if (rng.chance(0.08)) truth.likes = undefined;
    return truth;
  }

  // Küçük hesapta gerçek sıfırlar olur: ölçtük ve 0 (undefined değil).
  truth.shares = rng.chance(0.12) ? 0 : likeBase * rng.float(0.002, 0.012);
  truth.saves = likeBase * rng.float(0.004, 0.03);
  if (rng.chance(0.05)) truth.comments = 0;
  if (plan.source === "api") {
    // İçgörüler ilk ~2 günde hazır olmayabilir (reach/izlenme süresi gecikmeli).
    const insightsReady = input.ageDays > 2 || rng.chance(0.3);
    if (insightsReady) truth.reachRate = rng.float(0.62, 0.86);
    if (insightsReady && isVideoFormat(format) && input.durationSec !== undefined) {
      truth.avgWatchSec = Math.round(input.durationSec * rng.float(0.3, 0.62) * 10) / 10;
    }
    if (rng.chance(0.04)) truth.shares = undefined; // API bu içerikte değer döndürmedi
  }
  return truth;
}

/** Snapshot takvimi (yayından sonraki gün). Son nokta her zaman son toplama anıdır. */
const CAPTURE_AGES = [1, 2, 3.5, 5, 7, 10, 14, 21, 30, 45, 60, 80];

export function buildSnapshots(
  contentItemId: string,
  truth: ItemTruth,
  publishedMs: number,
  firstSeenMs: number,
  lastCollectedMs: number,
): MetricSnapshot[] {
  const times = [firstSeenMs];
  for (const age of CAPTURE_AGES) {
    const t = publishedMs + age * DAY_MS;
    if (t > firstSeenMs && t < lastCollectedMs - 0.05 * DAY_MS) times.push(t);
  }
  if (lastCollectedMs > firstSeenMs) times.push(lastCollectedMs);

  return times.map((t, i) => ({
    id: `ms_${contentItemId}_${String(i + 1).padStart(2, "0")}`,
    contentItemId,
    capturedAt: new Date(t).toISOString(),
    ...metricsAt(truth, growthCurve((t - publishedMs) / DAY_MS)),
  }));
}

/** Hesap takipçi serisi: kendi hesap günlük (birkaç gün ölçülemedi), rakip haftalık. */
export function buildAccountSnapshots(rng: Rng, clock: MockClock, plans: AccountPlan[]): AccountSnapshot[] {
  const out: AccountSnapshot[] = [];
  for (const plan of plans) {
    const own = plan.ownerKind === "own";
    const step = own ? 1 : 7;
    const gapDays = new Set(own ? [rng.int(3, 25), rng.int(30, 55), rng.int(60, 85)] : []);
    const followingBase = rng.int(150, 700);
    const postsBase = rng.int(150, 700);
    for (let d = 89; d >= 0; d -= step) {
      if (gapDays.has(d)) continue; // senkron/toplama başarısız: o gün ölçüm yok (0 değil)
      const age = d + plan.lastCollectedAge;
      if (age > 90 && !own) continue;
      const progress = 1 - age / 90;
      const isLatest = d === 0;
      const followers = isLatest
        ? plan.followersNow
        : Math.round(plan.followersStart + (plan.followersNow - plan.followersStart) * progress + rng.normal(0, plan.followersNow * 0.002));
      const extra: AccountSnapshot["extra"] = {};
      if (plan.source === "api") {
        extra.reach = Math.round(plan.followersNow * rng.float(0.4, 1.1));
        extra.profile_views = Math.round(plan.followersNow * rng.float(0.01, 0.04));
      }
      out.push({
        id: `as_${plan.id}_${String(89 - d).padStart(2, "0")}`,
        subjectKind: plan.ownerKind,
        subjectId: plan.id,
        capturedAt: clock.daysAgo(age),
        followers,
        following: own ? undefined : followingBase,
        postsCount: postsBase + Math.round((90 - age) / 3),
        extra,
      });
    }
  }
  return out;
}
