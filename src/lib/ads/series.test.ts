import { describe, expect, it } from "vitest";

import { shiftDay } from "@/lib/ads/days";
import { resolveAdRules } from "@/lib/ads/rules";
import { measureFatigue, measureStability, measureWorsening } from "@/lib/ads/series";
import type { AdDailyMetric } from "@/lib/domain/ads";

const rules = resolveAdRules();
const START = "2026-09-01";
/** `count` günlük seri; `make(i)` günün alanlarını verir. */
const series = (count: number, make: (i: number) => Partial<AdDailyMetric>): AdDailyMetric[] =>
  Array.from({ length: count }, (_, i) => ({ adId: "a", date: shiftDay(START, i), spend: 100, impressions: 1000, ...make(i) }));

describe("measureFatigue", () => {
  it("13 gün → undefined + few_days", () => {
    const out = measureFatigue(series(13, () => ({ clicks: 30, frequency: 4 })), rules);
    expect(out.value).toBeUndefined();
    expect(out.reason).toBe("few_days");
  });
  it("sıklık yüksek + tıklama oranı %25+ düşmüş → yorgun", () => {
    const out = measureFatigue(series(14, (i) => ({ clicks: i < 7 ? 30 : 15, frequency: 3.5 })), rules);
    expect(out.value).toBe(true);
  });
  it("tek günlük tıklama düşüşü yorgunluk değil", () => {
    const out = measureFatigue(series(14, (i) => ({ clicks: i === 13 ? 5 : 30, frequency: 3.5 })), rules);
    expect(out.value).toBe(false);
  });
  it("sıklık eşiğin altındaysa yorgun değil; sıklık ölçülmediyse undefined", () => {
    expect(measureFatigue(series(14, (i) => ({ clicks: i < 7 ? 30 : 10, frequency: 1.2 })), rules).value).toBe(false);
    expect(measureFatigue(series(14, () => ({ clicks: 30 })), rules)).toEqual({ reason: "frequency_unmeasured" });
  });
});

describe("measureFatigue — günlük sıklık eşiği (inceleme B)", () => {
  const drop = (frequency: number) => series(14, (i) => ({ clicks: i < 7 ? 30 : 15, frequency }));
  it("günlük satırda ~1,8 sıklık + tıklama düşüşü yorgunluk sayılır (dönem eşiği 3 olsaydı hiç çıkmazdı)", () => {
    expect(rules.fatigueFrequencyMin).toBe(3);
    expect(measureFatigue(drop(1.8), rules).value).toBe(true);
  });
  it("sağlıklı günlük sıklık (~1,1) tıklama düşse de yorgunluk değil; eşik tam eşitse AŞILMAMIŞTIR", () => {
    expect(measureFatigue(drop(1.1), rules).value).toBe(false);
    expect(measureFatigue(drop(rules.fatigueDailyFrequency), rules).value).toBe(false);
  });
  it("eşik hesap başına ezilebilir; dönem eşiği (fatigueFrequencyMin) günlük satırı etkilemez", () => {
    expect(measureFatigue(drop(1.8), resolveAdRules({ fatigueDailyFrequency: 2 })).value).toBe(false);
    expect(measureFatigue(drop(1.8), resolveAdRules({ fatigueFrequencyMin: 9 })).value).toBe(true);
  });
});

describe("measureStability", () => {
  it("6 harcamalı gün → undefined", () => {
    expect(measureStability(series(6, () => ({ results: 5 })), rules).reason).toBe("few_spend_days");
  });
  it("düz maliyet istikrarlı, dalgalı maliyet değil", () => {
    expect(measureStability(series(10, () => ({ results: 5 })), rules).value).toBe(true);
    expect(measureStability(series(10, (i) => ({ results: i % 2 === 0 ? 1 : 20 })), rules).value).toBe(false);
  });
  it("sonuç ölçülmediyse undefined", () => {
    expect(measureStability(series(10, () => ({})), rules).reason).toBe("results_unmeasured");
  });
});

describe("measureWorsening", () => {
  it("27 gün → undefined + few_days", () => {
    expect(measureWorsening(series(27, () => ({ results: 5 })), rules)).toEqual({ reason: "few_days" });
  });
  it("28 gün: son 7 gün maliyet 1,3 katın üstüyse kötüleşme", () => {
    const worse = measureWorsening(series(28, (i) => ({ results: i >= 21 ? 3 : 5 })), rules);
    expect(worse.value).toBe(true);
    const steady = measureWorsening(series(28, () => ({ results: 5 })), rules);
    expect(steady.value).toBe(false);
  });
  it("sonuç ölçülmediyse undefined", () => {
    expect(measureWorsening(series(28, () => ({})), rules).reason).toBe("results_unmeasured");
  });
});

describe("ölçülmemiş ≠ 0 (inceleme düzeltmeleri)", () => {
  it("son günlerin tıklaması ölçülmediyse yorgunluk undefined (0 tıklama sayılmaz)", () => {
    const out = measureFatigue(series(14, (i) => ({ clicks: i >= 11 ? undefined : 20, frequency: 3.5 })), rules);
    expect(out.value).toBeUndefined();
    expect(out.reason).toBe("clicks_unmeasured");
  });
  it("harcamalı günde ölçülmüş 0 sonuç istikrarsızdır", () => {
    const out = measureStability(series(14, (i) => ({ results: i % 2 === 0 ? 0 : 5 })), rules);
    expect(out.value).toBe(false);
  });
});
