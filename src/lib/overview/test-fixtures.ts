/** Özet testleri için elle kurulmuş girdiler (mock'a bağlı değil; yalnız test dosyaları import eder). */
import type { Kpi, KpiKey, Overview } from "@/lib/domain/overview";
import type { OverviewSummaryInput } from "@/lib/overview/types";

const kpi = (key: KpiKey, value?: number, previous?: number): Kpi => ({
  key,
  label: key,
  unit: "count",
  value,
  previous,
  unmeasuredReason: value === undefined ? "ölçülemedi" : undefined,
});

export interface OverviewFixture {
  posts?: number;
  postsPrev?: number;
  views?: number;
  viewsPrev?: number;
  followers?: number;
}

export function makeOverview(fixture: OverviewFixture = {}): Overview {
  return {
    days: 30,
    kpis: [
      kpi("followers", fixture.followers),
      kpi("views", fixture.views, fixture.viewsPrev),
      kpi("posts", fixture.posts, fixture.postsPrev),
    ],
    trends: [],
    recentOutliers: [],
    cost: {
      month: "2026-10",
      apify: { committedUsd: 0, actualUsd: 0, runs: 0, unreconciledRuns: 0, priceUnknownRuns: 0 },
      llm: { committedUsd: 0, actualUsd: 0, runs: 0, unreconciledRuns: 0, priceUnknownRuns: 0 },
      subscription: { runs: 0, byProvider: {}, shadow: { pricedRuns: 0, unpricedRuns: 0, unlistedRuns: 0, priceVersion: "test" } },
      totalCommittedUsd: 0,
    },
  };
}

/** Veri olan, hesabı bağlı, hiçbir iş beklemeyen çalışma alanı: testler yalnız ilgili alanı değiştirir. */
export function makeInput(patch: Partial<OverviewSummaryInput> = {}): OverviewSummaryInput {
  return {
    operator: false,
    accounts: [{ id: "acc-1" }],
    overview: makeOverview({ posts: 20, views: 14_800, postsPrev: 10, viewsPrev: 10_000, followers: 3000 }),
    lastCollectedAt: "2026-10-01T15:26:00.000Z",
    currentWeekStart: "2026-10-05",
    ...patch,
  };
}
