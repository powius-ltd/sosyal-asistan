import { describe, expect, it } from "vitest";

import {
  AD_ENTITY_STATUSES,
  AD_FORMATS,
  AD_REF_PREFIX,
  AD_SIGNALS,
  AD_VERDICT_STATUSES,
  DEFAULT_AD_RULES,
  adRefOf,
  computeAdMetrics,
  sumAdMetrics,
  type AdDailyMetric,
} from "@/lib/domain/ads";

const day = (date: string, patch: Partial<AdDailyMetric> = {}): AdDailyMetric => ({ adId: "a1", date, spend: 10, impressions: 1000, ...patch });

describe("reklam ölçüleri: undefined ≠ 0", () => {
  it("0 gösterimde oranlar undefined (0 değil)", () => {
    const metrics = computeAdMetrics(sumAdMetrics([day("2026-10-01", { spend: 0, impressions: 0, clicks: 0 })]));
    expect(metrics.clickRate).toBeUndefined();
    expect(metrics.costPerThousand).toBeUndefined();
    expect(metrics.threeSecondRate).toBeUndefined();
  });

  it("results ölçülmemişse sonuç maliyeti ve sonuç oranı undefined; 0 sonuç da maliyet vermez", () => {
    const none = computeAdMetrics(sumAdMetrics([day("2026-10-01", { clicks: 20 })]));
    expect(none.costPerResult).toBeUndefined();
    expect(none.resultRate).toBeUndefined();
    const zero = computeAdMetrics(sumAdMetrics([day("2026-10-01", { clicks: 20, results: 0 })]));
    expect(zero.costPerResult).toBeUndefined();
    expect(zero.resultRate).toBe(0);
  });

  it("toplamı toplayıp böler; ölçülmeyen alan toplamda undefined kalır", () => {
    const sums = sumAdMetrics([day("2026-10-01", { clicks: 10, results: 1, resultValue: 50 }), day("2026-10-02", { clicks: 30, results: 3, resultValue: 150 })]);
    expect(sums).toMatchObject({ spend: 20, impressions: 2000, clicks: 40, results: 4, resultValue: 200, days: 2 });
    expect(sums.video3sViews).toBeUndefined();
    const metrics = computeAdMetrics(sums);
    expect(metrics.clickRate).toBeCloseTo(0.02);
    expect(metrics.costPerClick).toBeCloseTo(0.5);
    expect(metrics.costPerThousand).toBeCloseTo(10);
    expect(metrics.costPerResult).toBeCloseTo(5);
    expect(metrics.returnOnSpend).toBeCloseTo(10);
    expect(metrics.resultRate).toBeCloseTo(0.1);
    expect(metrics.holdRate).toBeUndefined();
  });

  it("boş liste: harcama 0 ama oranlar undefined", () => {
    const sums = sumAdMetrics([]);
    expect(sums).toMatchObject({ spend: 0, impressions: 0, days: 0 });
    expect(Object.values(computeAdMetrics(sums)).every((value) => value === undefined)).toBe(true);
  });

  it("video oranları", () => {
    const metrics = computeAdMetrics(sumAdMetrics([day("2026-10-01", { video3sViews: 400, videoThruplays: 100 })]));
    expect(metrics.threeSecondRate).toBeCloseTo(0.4);
    expect(metrics.holdRate).toBeCloseTo(0.25);
  });
});

describe("reklam sabitleri", () => {
  it("başvuru biçimi", () => {
    expect(adRefOf("x")).toBe(`${AD_REF_PREFIX}x`);
  });

  it("eşikler sonlu ve mantıklı sırada", () => {
    for (const value of Object.values(DEFAULT_AD_RULES)) expect(Number.isFinite(value)).toBe(true);
    expect(DEFAULT_AD_RULES.costScaleBelowTargetMultiple).toBeLessThan(DEFAULT_AD_RULES.costReduceAboveTargetMultiple);
    expect(DEFAULT_AD_RULES.costReduceAboveTargetMultiple).toBeLessThan(DEFAULT_AD_RULES.costStopAboveTargetMultiple);
    expect(DEFAULT_AD_RULES.reduceBelowTargetShare).toBeLessThan(1);
    expect(DEFAULT_AD_RULES.scaleAboveTargetMultiple).toBeGreaterThan(1);
    expect(DEFAULT_AD_RULES.worseningMinDays).toBe(DEFAULT_AD_RULES.worseningRecentDays + DEFAULT_AD_RULES.worseningBaselineDays);
  });

  it("karar ve işaret listeleri benzersiz", () => {
    for (const list of [AD_VERDICT_STATUSES, AD_SIGNALS, AD_FORMATS, AD_ENTITY_STATUSES]) expect(new Set(list).size).toBe(list.length);
  });
});
