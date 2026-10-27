import { describe, expect, it } from "vitest";

import { LEARNING_KINDS } from "@/lib/ads/learning";
import { AD_REASON_CODES } from "@/lib/ads/verdict";
import { AD_SIGNALS, AD_VERDICT_STATUSES } from "@/lib/domain/ads";
import {
  AD_CELL_PLAIN,
  AD_EMPTY_PLAIN,
  AD_LEARNING_PLAIN,
  AD_ORGANIC_PLAIN,
  AD_REASON_PLAIN,
  AD_WEAK_MARK_PLAIN,
  AD_SIGNAL_PLAIN,
  AD_VERDICT_PLAIN,
  PANEL_JARGON,
  adCostPhrase,
  adCountPhrase,
  adReasonPhrases,
  adUnmeasuredPhrase,
  adReturnPhrase,
  adUnlabeledPhrase,
  liftPhrase,
} from "@/lib/plain-language";

const strings = (value: unknown): string[] => (typeof value === "string" ? [value] : value !== null && typeof value === "object" ? Object.values(value).flatMap(strings) : []);

describe("reklam sözlüğü", () => {
  it("her işaretin ve kararın karşılığı dolu; rozetler birbirinden ayrı", () => {
    for (const signal of AD_SIGNALS) {
      expect(AD_SIGNAL_PLAIN[signal].badge.length).toBeGreaterThan(0);
      expect(AD_SIGNAL_PLAIN[signal].meaning.endsWith(".")).toBe(true);
    }
    for (const status of AD_VERDICT_STATUSES) {
      expect(AD_VERDICT_PLAIN[status].label.length).toBeGreaterThan(0);
      expect(AD_VERDICT_PLAIN[status].advice.endsWith(".")).toBe(true);
    }
    expect(new Set(AD_SIGNALS.map((signal) => AD_SIGNAL_PLAIN[signal].badge)).size).toBe(AD_SIGNALS.length);
    expect(new Set(AD_VERDICT_STATUSES.map((status) => AD_VERDICT_PLAIN[status].label)).size).toBe(AD_VERDICT_STATUSES.length);
  });

  it("panel ve reklam jargonu taşımaz", () => {
    const all = [AD_SIGNAL_PLAIN, AD_VERDICT_PLAIN, AD_CELL_PLAIN, AD_EMPTY_PLAIN, AD_REASON_PLAIN, AD_LEARNING_PLAIN, AD_ORGANIC_PLAIN, AD_WEAK_MARK_PLAIN].flatMap(strings);
    expect(all.length).toBeGreaterThan(20);
    expect(all.filter((text) => PANEL_JARGON.test(text))).toEqual([]);
    expect([adCostPhrase(0.7), adReturnPhrase(1.4), adCountPhrase(3), adUnlabeledPhrase(2)].filter((text) => text === undefined || PANEL_JARGON.test(text))).toEqual([]);
  });

  it("jargon deseni reklam kısaltmalarını yakalar, sıradan kelimeyi yakalamaz", () => {
    for (const term of ["ROAS 2,1", "CPA düştü", "CTR %3", "cpm arttı", "CPC"]) expect(PANEL_JARGON.test(term)).toBe(true);
    for (const text of ["reklamda tuttu", "electric", "kapak"]) expect(PANEL_JARGON.test(text)).toBe(false);
  });

  it("oran cümleleri: ayrı ölçü, ayrı cümle; ölçülemeyen için cümle kurulmaz", () => {
    expect(adCostPhrase(0.7)).toBe("bir sonuç alışılmışın 0,7 katına mal oldu");
    expect(adCostPhrase(1.02)).toBe("bir sonuç alışılmış maliyetle geldi");
    expect(adReturnPhrase(1.4)).toBe("harcanan para alışılmışın 1,4 katı geri döndü");
    expect(adReturnPhrase(1)).toBe("harcanan para alışılmış düzeyde geri döndü");
    for (const value of [undefined, Number.NaN, -1, 0]) {
      expect(adCostPhrase(value)).toBeUndefined();
      expect(adReturnPhrase(value)).toBeUndefined();
    }
  });

  it("iki ölçü ayrı yonga: organik izlenme katı ile reklam maliyet katı farklı cümle, rozetler birbirinden ayrı", () => {
    const organic = liftPhrase(3.2);
    const ad = adCostPhrase(0.7);
    expect(organic).toBeDefined();
    expect(ad).toBeDefined();
    expect(organic).not.toBe(ad);
    expect(ad).toContain("alışılmışın 0,7 katına");
    const badges = [AD_ORGANIC_PLAIN.candidate.badge, ...Object.values(AD_ORGANIC_PLAIN.used).map((u) => u.badge)];
    expect(new Set(badges).size).toBe(badges.length);
  });

  it("sayı cümleleri: 0 için cümle yok", () => {
    expect(adCountPhrase(3)).toBe("3 reklam");
    expect(adCountPhrase(0)).toBeUndefined();
    expect(adUnlabeledPhrase(2)).toBe("2 reklamın hangi yaklaşıma girdiği bilinmiyor; burada sayılmadı.");
    expect(adUnlabeledPhrase(0)).toBeUndefined();
  });
});

describe("karar sebebi ve öğrenme cümleleri", () => {
  it("her sebep koduna tek düz cümle; cümlelerde rakam ve jargon yok", () => {
    for (const code of AD_REASON_CODES) {
      expect(AD_REASON_PLAIN[code].endsWith("."), code).toBe(true);
      expect(/\d/.test(AD_REASON_PLAIN[code]), `${code}: sayı gömülmez`).toBe(false);
    }
    expect(new Set(AD_REASON_CODES.map((code) => AD_REASON_PLAIN[code])).size).toBe(AD_REASON_CODES.length);
    expect(Object.keys(AD_REASON_PLAIN).sort()).toEqual([...AD_REASON_CODES].sort());
  });
  it("her öğrenme türünün rozeti ve cümlesi var; rozetler ayrı", () => {
    for (const kind of LEARNING_KINDS) expect(AD_LEARNING_PLAIN[kind].meaning.endsWith(".")).toBe(true);
    expect(new Set(LEARNING_KINDS.map((kind) => AD_LEARNING_PLAIN[kind].badge)).size).toBe(LEARNING_KINDS.length);
  });
  it("adReasonPhrases sırayı korur ve bilinmeyen kodu atlar", () => {
    expect(adReasonPhrases({ reasons: ["learning_days", "yok", "learning_results"] })).toEqual([AD_REASON_PLAIN.learning_days, AD_REASON_PLAIN.learning_results]);
  });
  it("ölçülemeyen girdi cümlesi: bilinen kod cümle olur, bilinmeyen undefined", () => {
    expect(adUnmeasuredPhrase("worsening:few_days")).toBe("Ani kötüleşme ölçülemedi: yeterli gün yok.");
    expect(adUnmeasuredPhrase("returnOnSpend")).toContain("getiri hesaplanamadı");
    expect(adUnmeasuredPhrase("uydurma:kod")).toBeUndefined();
    expect(adUnmeasuredPhrase("fatigue:few_days") && PANEL_JARGON.test(adUnmeasuredPhrase("fatigue:few_days") ?? "")).toBe(false);
  });
});
