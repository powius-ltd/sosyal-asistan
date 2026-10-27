import { describe, expect, it } from "vitest";

import { betterThanBaseline, computeBaseline, vsBaselineOf } from "@/lib/ads/baseline";
import type { AdDailyMetric } from "@/lib/domain/ads";

const row = (adId: string, spend: number, results?: number, resultValue?: number): AdDailyMetric => ({ adId, date: "2026-10-01", spend, impressions: 1000, results, resultValue });

describe("computeBaseline", () => {
  it("harcama ağırlıklıdır: toplam / toplam", () => {
    const out = computeBaseline(new Map([["a", [row("a", 100, 10, 500)]], ["b", [row("b", 300, 10, 900)]]]));
    expect(out.baseline).toEqual({ costPerResult: 20, returnOnSpend: 3.5 });
  });
  it("tek reklamlı hesapta undefined + sebep", () => {
    const out = computeBaseline(new Map([["a", [row("a", 100, 10)]], ["b", [row("b", 0)]]]));
    expect(out.baseline).toBeUndefined();
    expect(out.reason).toBe("single_ad");
  });
  it("harcama yoksa sebep no_spend", () => {
    expect(computeBaseline(new Map()).reason).toBe("no_spend");
  });
});

describe("vsBaselineOf / betterThanBaseline", () => {
  it("katı hesaplar, ölçülemeyen undefined", () => {
    const vs = vsBaselineOf({ costPerResult: 15, returnOnSpend: undefined }, { costPerResult: 30, returnOnSpend: 2 });
    expect(vs).toEqual({ costPerResult: 0.5, returnOnSpend: undefined });
    expect(betterThanBaseline(vs)).toBe(true);
    expect(betterThanBaseline({})).toBeUndefined();
    expect(betterThanBaseline({ returnOnSpend: 0.8 })).toBe(false);
  });
});
