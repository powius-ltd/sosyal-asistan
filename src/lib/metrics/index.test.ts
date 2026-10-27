import { describe, expect, it } from "vitest";

import * as metrics from "@/lib/metrics";

describe("@/lib/metrics genel dışa aktarım", () => {
  it("her modülün ana fonksiyonu tek giriş noktasından erişilebilir", () => {
    const expected = [
      "mean",
      "median",
      "percentileRank",
      "pearson",
      "pyRound",
      "isValidDate",
      "accountBaseline",
      "isYoung",
      "lift",
      "liftTier",
      "crossScore",
      "similarSize",
      "assignTiers",
      "topAndBottom",
      "engagementOf",
      "computeEngagementStats",
      "computeFormatBreakdown",
      "computeReelPlayRate",
      "benchmarkBand",
      "computeCadence",
      "computeHeatmap",
      "computeTrend",
      "bestPostingHours",
      "captionLengthCorrelation",
      "hashtagCountCorrelation",
      "durationViewsCorrelation",
      "hashtagFrequency",
      "buildAccountPackage",
      "tieredContent",
      "scoreAccount",
    ] as const;
    for (const name of expected) expect(typeof metrics[name], name).toBe("function");
    expect(metrics.LIFT_TIER_MIN).toEqual([0, 1.5, 2, 3, 5]);
    expect(metrics.BASELINE_DEFAULTS).toEqual({ window: 25, minAgeDays: 3, minN: 10 });
  });
});
