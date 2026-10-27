/**
 * Mock görünümü: Genel bakış (KPI + günlük trendler + son outlier'lar + maliyet).
 *
 *  - Takipçi: kendi hesap snapshot'larından; bir gün herhangi bir hesabın ölçümü yoksa o gün
 *    undefined (grafikte boşluk, 0 değil).
 *  - İzlenme: içerik snapshot'larının doğrusal ara değerlemesiyle dönemde KAZANILAN izlenme (yayından
 *    önce 0, son ölçümden sonra düz).
 *  - Etkileşim oranı: hesap `lib/metrics` `medianEngagementRate`'te (burada hesap YOK): dönemde yayınlanan
 *    içeriklerin (beğeni + yorum) / takipçi oranının MEDYANI; pay ve payda aynı içerik kümesinden.
 *    Günlük seride her gün, o güne biten `days` günlük pencerenin medyanıdır (son gün = KPI).
 *  - Günler workspace saat diliminde (Europe/Istanbul) sayılır.
 *  - `query.accountId`: KPI/trend o hesaba, rakip tutanlar hesabın platformuna süzülür; `query.platform`
 *    hem kendi hesapları hem rakip tutanları platforma süzer (bkz. `OverviewQuery`).
 */
import { fromZonedTime } from "date-fns-tz";

import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import { OUTLIER_MIN_TIER, type AccountSnapshot, type ContentItem, type MetricSnapshot } from "@/lib/domain/content";
import { ENGAGEMENT_RATE_LABEL, type Kpi, type Overview, type TrendPoint, type TrendSeries } from "@/lib/domain/overview";
import type { CollectionRun, Workspace } from "@/lib/domain/run";
import { toDayKey } from "@/lib/format";
import type { OverviewQuery } from "@/lib/data/queries";
import { RepositoryError } from "@/lib/data/repository";
import { filterOutliers } from "@/lib/data/mock/mock-filters";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import { DAY_MS } from "@/lib/time";
import { monthKey, summarizeCost } from "@/lib/data/mock/views/cost";
import { buildBestTimes } from "@/lib/data/views/best-times";
import { followersAt, gainedViews } from "@/lib/data/views/gains";
import { medianEngagementRate } from "@/lib/metrics";

export interface OverviewInput {
  ws: Workspace;
  own: OwnAccount[];
  competitors: Competitor[];
  items: ContentItem[];
  snapshotsByItem: Map<string, MetricSnapshot[]>;
  accountSnapshots: AccountSnapshot[];
  runs: CollectionRun[];
  clock: MockClock;
}

export function buildOverview(input: OverviewInput, query: OverviewQuery = {}): Overview {
  const { ws, clock } = input;
  const days = Math.min(Math.max(Math.floor(query.days ?? 30), 1), 365);
  const account = query.accountId === undefined ? undefined : input.own.find((a) => a.id === query.accountId);
  if (query.accountId !== undefined && !account) {
    throw new RepositoryError("not_found", `Hesap bulunamadı: ${query.accountId}`);
  }
  const own = input.own.filter((a) => (!account || a.id === account.id) && (!query.platform || a.platform === query.platform));
  const ownIds = new Set(own.map((a) => a.id));
  const ownItems = input.items.filter((c) => c.owner.kind === "own" && ownIds.has(c.owner.id));
  const ownSnaps = input.accountSnapshots.filter((s) => s.subjectKind === "own" && ownIds.has(s.subjectId));

  // Gün sınırları (workspace saat diliminde): bugün dahil son `days` gün.
  const todayKey = toDayKey(clock.nowIso, ws.timezone) ?? clock.nowIso.slice(0, 10);
  const todayStart = fromZonedTime(`${todayKey}T00:00:00`, ws.timezone).getTime();
  const dayStarts = Array.from({ length: days + 1 }, (_, i) => todayStart - (days - 1 - i) * DAY_MS);
  const windowStart = dayStarts[0];
  const prevStart = windowStart - days * DAY_MS;
  const now = clock.nowMs;

  const publishedIn = (c: ContentItem, from: number, to: number) => {
    const t = c.publishedAt ? new Date(c.publishedAt).getTime() : undefined;
    return t !== undefined && t >= from && t < to;
  };
  // Etkileşim oranı: [from, to) aralığında yayınlanan içeriklerin medyan ER'i (hesap `lib/metrics`'te).
  const engagementIn = (from: number, to: number) =>
    medianEngagementRate(
      ownItems
        .filter((c) => publishedIn(c, from, to))
        .map((c) => ({ likes: c.metrics.likes, comments: c.metrics.comments, followers: c.owner.followers })),
    );
  // Rakip tutanlar: platform süzgeci ve (hesap seçiliyse) hesabın platformu.
  const competitorItems = input.items.filter(
    (c) =>
      c.owner.kind === "competitor" &&
      (!query.platform || c.platform === query.platform) &&
      (!account || c.platform === account.platform),
  );
  const outliers = filterOutliers(competitorItems, { minTier: OUTLIER_MIN_TIER, sort: "lift" }, input.own, input.competitors);
  const followersNow = own.every((a) => a.followers !== undefined) && own.length > 0
    ? own.reduce((s, a) => s + (a.followers as number), 0)
    : undefined;

  const kpis: Kpi[] = [
    { key: "followers", label: "Toplam takipçi", unit: "count", value: followersNow, previous: followersAt(ownSnaps, own, windowStart) },
    { key: "views", label: "İzlenme", unit: "count", value: gainedViews(input.snapshotsByItem, ownItems, windowStart, now), previous: gainedViews(input.snapshotsByItem, ownItems, prevStart, windowStart) },
    {
      key: "engagement_rate", label: ENGAGEMENT_RATE_LABEL, unit: "percent",
      value: engagementIn(windowStart, now + 1), previous: engagementIn(prevStart, windowStart),
    },
    {
      // Hesaptan hiç içerik toplanmadıysa sayı ölçülmemiştir (0 değil): "0 yayın" demek hesaba bakılmış gibi görünürdü.
      key: "posts", label: "Yayınlanan içerik", unit: "count",
      value: ownItems.length === 0 ? undefined : ownItems.filter((c) => publishedIn(c, windowStart, now + 1)).length,
      previous: ownItems.length === 0 ? undefined : ownItems.filter((c) => publishedIn(c, prevStart, windowStart)).length,
    },
    { key: "tracked_competitors", label: "Takip edilen rakip", unit: "count", value: input.competitors.filter((c) => c.status === "tracked").length },
    {
      key: "outliers", label: "Tutan içerik", unit: "count",
      value: outliers.filter((c) => publishedIn(c, windowStart, now + 1)).length,
      previous: outliers.filter((c) => publishedIn(c, prevStart, windowStart)).length,
    },
  ];
  for (const k of kpis) {
    if (k.value !== undefined) continue;
    k.unmeasuredReason =
      k.key === "followers"
        ? "Takipçi sayısı ölçülemeyen hesap var."
        : k.key === "views"
          ? "Dönemde izlenmesi ölçülmüş içerik yok."
          : k.key === "posts"
            ? "Hesaptan henüz içerik toplanmadı."
            : "Dönemde beğeni ve yorum sayısı ölçülmüş, takipçisi bilinen içerik yok; oran hesaplanamadı.";
  }

  // Günlük seriler: bir gün hiçbir hesap senkronlanmadıysa o gün ölçülemedi (undefined).
  const followerPts: TrendPoint[] = [];
  const viewPts: TrendPoint[] = [];
  const ratePts: TrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const from = dayStarts[i];
    const to = Math.min(dayStarts[i + 1], now);
    const date = toDayKey(new Date(from + DAY_MS / 2), ws.timezone) ?? "";
    const daySnaps = ownSnaps.filter((s) => toDayKey(s.capturedAt, ws.timezone) === date);
    const dayFollowers = own.map((a) => daySnaps.find((s) => s.subjectId === a.id)?.followers);
    const synced = own.length > 0 && dayFollowers.every((v) => v !== undefined);
    followerPts.push({
      date,
      value: synced ? dayFollowers.reduce<number>((sum, v) => sum + (v as number), 0) : undefined,
    });
    viewPts.push({ date, value: daySnaps.length > 0 ? gainedViews(input.snapshotsByItem, ownItems, from, to) : undefined });
    // O güne biten `days` günlük pencerenin medyan ER'i (son gün = KPI).
    ratePts.push({ date, value: engagementIn(from - (days - 1) * DAY_MS, Math.min(dayStarts[i + 1], now + 1)) });
  }
  const trends: TrendSeries[] = [
    { key: "followers", label: "Takipçi", unit: "count", points: followerPts },
    { key: "views", label: "İzlenme", unit: "count", points: viewPts },
    { key: "engagement_rate", label: ENGAGEMENT_RATE_LABEL, unit: "percent", points: ratePts },
  ];

  return {
    days,
    kpis,
    trends,
    recentOutliers: outliers.filter((c) => publishedIn(c, windowStart, now + 1)).slice(0, 5),
    cost: summarizeCost(input.runs, ws, monthKey(clock.nowIso, ws.timezone)),
    ...buildBestTimes(ownItems, ws.timezone, now),
  };
}
