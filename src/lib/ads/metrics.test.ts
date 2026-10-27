import { describe, expect, it } from "vitest";

import { costForDecision, measureAd } from "@/lib/ads/metrics";
import type { AdDailyMetric } from "@/lib/domain/ads";

const day = (date: string, extra: Partial<AdDailyMetric> = {}): AdDailyMetric => ({ adId: "a", date, spend: 100, impressions: 1000, ...extra });

describe("measureAd", () => {
  it("toplar, sonra böler", () => {
    const { metrics } = measureAd([day("2026-10-01", { clicks: 20, results: 2, resultValue: 300, video3sViews: 400, videoThruplays: 100 }), day("2026-10-02", { clicks: 40, results: 3, resultValue: 500 })]);
    expect(metrics.clickRate).toBeCloseTo(0.03);
    expect(metrics.costPerClick).toBeCloseTo(200 / 60);
    expect(metrics.costPerThousand).toBe(100);
    expect(metrics.costPerResult).toBe(40);
    expect(metrics.returnOnSpend).toBe(4);
    expect(metrics.resultRate).toBeCloseTo(5 / 60);
    expect(metrics.threeSecondRate).toBeCloseTo(0.2);
    expect(metrics.holdRate).toBe(0.25);
  });
  it("0 gösterimde oranlar undefined", () => {
    const { metrics } = measureAd([day("2026-10-01", { impressions: 0, clicks: 0 })]);
    expect(metrics.clickRate).toBeUndefined();
    expect(metrics.costPerThousand).toBeUndefined();
  });
  it("results alanı yoksa sonuç maliyeti undefined", () => {
    expect(measureAd([day("2026-10-01")]).metrics.costPerResult).toBeUndefined();
  });
  it("resultValue alanı yoksa getiri undefined", () => {
    expect(measureAd([day("2026-10-01", { results: 3 })]).metrics.returnOnSpend).toBeUndefined();
  });
});

describe("costForDecision", () => {
  it("ölçülen 0 sonuç + harcama → sonsuz; ölçülmeyen → undefined", () => {
    const zero = measureAd([day("2026-10-01", { results: 0 })]);
    expect(costForDecision(zero.sums, zero.metrics)).toBe(Number.POSITIVE_INFINITY);
    const none = measureAd([day("2026-10-01")]);
    expect(costForDecision(none.sums, none.metrics)).toBeUndefined();
  });
});
