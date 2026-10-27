import { describe, expect, it } from "vitest";

import { decideAd, type VerdictInput } from "@/lib/ads/verdict";
import { resolveAdRules } from "@/lib/ads/rules";
import type { AdGoal, AdMetricSums } from "@/lib/domain/ads";
import { computeAdMetrics } from "@/lib/domain/ads";

const valueGoal: AdGoal = { kind: "value", resultLabel: "satın alma", targetReturn: 3, grossMargin: 0.5 };
const costGoal: AdGoal = { kind: "cost", resultLabel: "form", targetCostPerResult: 20 };
const calm = { value: false as boolean | undefined };
const input = (sums: Partial<AdMetricSums>, over: Partial<VerdictInput> = {}): VerdictInput => {
  const full: AdMetricSums = { spend: 1000, impressions: 100000, clicks: 2000, results: 80, resultValue: 3500, days: 14, ...sums };
  return { goal: valueGoal, sums: full, metrics: computeAdMetrics(full), ageDays: 14, fatigue: calm, stability: { value: true }, worsening: calm, rules: resolveAdRules(), ...over };
};

describe("decideAd — sıranın her basamağı", () => {
  it("1 hedef yok → undecided; eksik hedef → undecided", () => {
    expect(decideAd(input({}, { goal: undefined }))).toMatchObject({ status: "undecided", reasons: ["goal_missing"] });
    expect(decideAd(input({}, { goal: { kind: "value", resultLabel: "x" } }))).toMatchObject({ status: "undecided", reasons: ["goal_incomplete"] });
  });
  it("2 harcama yok / anahtar ölçü yok → insufficient_data", () => {
    expect(decideAd(input({ spend: 0 })).status).toBe("insufficient_data");
    const out = decideAd(input({ resultValue: undefined }));
    expect(out).toMatchObject({ status: "insufficient_data", reasons: ["key_unmeasured"], unmeasured: ["returnOnSpend"] });
  });
  it("3 7 günden genç ya da 50 sonuçtan az → learning", () => {
    expect(decideAd(input({}, { ageDays: 5 })).status).toBe("learning");
    expect(decideAd(input({ results: 20 })).reasons).toEqual(["learning_results"]);
  });
  it("4 getiri başabaş altında → stop (marjdan: 1 / 0,5 = 2)", () => {
    expect(decideAd(input({ resultValue: 1500 }))).toMatchObject({ status: "stop", reasons: ["stop_below_break_even"] });
  });
  it("4b sonuç kapısı: az sonuç + küçük harcamada stop yok", () => {
    const rules = resolveAdRules({ learningMinResults: 0, learningMinDays: 0 });
    const baseline = { costPerResult: 20 };
    const small = decideAd(input({ spend: 30, results: 2, resultValue: 10 }, { rules, baseline }));
    expect(small.status).toBe("insufficient_data");
    expect(small.reasons).toEqual(["stop_gate_few_results"]);
    const big = decideAd(input({ spend: 400, results: 2, resultValue: 10 }, { rules, baseline }));
    expect(big.status).toBe("stop");
  });
  it("5 hedefin %70'i altı → reduce", () => {
    expect(decideAd(input({ resultValue: 2050 })).status).toBe("reduce");
  });
  it("6 sıklık + tıklama düşüşü → fatigued", () => {
    expect(decideAd(input({}, { fatigue: { value: true } })).status).toBe("fatigued");
  });
  it("7 hedefin 1,2 katı + istikrar → scale", () => {
    expect(decideAd(input({ resultValue: 4000 }))).toMatchObject({ status: "scale", reasons: ["scale_above_target"] });
  });
  it("7b istikrarsız, ölçülmemiş istikrar, ani kötüleşme, iniş sayfası şüphesi → hold", () => {
    expect(decideAd(input({ resultValue: 4000 }, { stability: { value: false } })).reasons).toEqual(["unstable"]);
    expect(decideAd(input({ resultValue: 4000 }, { stability: { reason: "few_spend_days" } }))).toMatchObject({ status: "hold", reasons: ["stability_unmeasured"], unmeasured: ["stability:few_spend_days"] });
    expect(decideAd(input({ resultValue: 4000 }, { worsening: { value: true } })).reasons).toEqual(["recent_worsening"]);
    expect(decideAd(input({ resultValue: 4000, clicks: 20000, results: 80 })).status).toBe("hold");
  });
  it("8 hedefe yakın → hold (on_target)", () => {
    expect(decideAd(input({ resultValue: 3200 }))).toMatchObject({ status: "hold", reasons: ["on_target"] });
  });
});

describe("decideAd — sonuç maliyeti modu", () => {
  const cost = (spend: number, results: number) => decideAd(input({ spend, results, resultValue: undefined }, { goal: costGoal }));
  it("2 katı üstü kapat, 1,3 katı üstü azalt, 0,8 katı altı artır, arası bekle", () => {
    expect(cost(3000, 60)).toMatchObject({ status: "stop", reasons: ["stop_cost_far_above_target"] });
    expect(cost(1800, 60)).toMatchObject({ status: "reduce", reasons: ["reduce_cost_above_target"] });
    expect(cost(900, 60)).toMatchObject({ status: "scale", reasons: ["scale_cost_below_target"] });
    expect(cost(1200, 60).status).toBe("hold");
  });
  it("sonuç ölçülmediyse karar yok (0 sayılmaz)", () => {
    const out = decideAd(input({ results: undefined, resultValue: undefined }, { goal: costGoal }));
    expect(out).toMatchObject({ status: "insufficient_data", unmeasured: ["costPerResult"] });
  });
});

describe("adConfidenceOf üzerinden güven", () => {
  it("çok sonuç + gün → high; az → low", () => {
    expect(decideAd(input({ results: 80 })).confidence).toBe("high");
    expect(decideAd(input({ results: 12, impressions: 5000, days: 3 }, { ageDays: 3 })).confidence).toBe("low");
  });
});

describe("sonuç sayısı ölçülmüyorsa", () => {
  it("learning_results denmez; ölçülemeyen olarak yazılır, karar değerden verilir", () => {
    const out = decideAd(input({ results: undefined, resultValue: 4500 }));
    expect(out.reasons).not.toContain("learning_results");
    expect(out.unmeasured).toContain("results");
    expect(out.status).toBe("scale");
  });
});
