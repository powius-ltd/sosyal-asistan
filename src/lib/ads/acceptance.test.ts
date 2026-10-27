/** Kabul seti (plan §7): 6 senaryo aynı sınıfa düşer + 4 kusur testi. Uçtan uca: günlük satır → `buildAdReport` → karar. */
import { describe, expect, it } from "vitest";

import { NOW, VALUE_GOAL, accountOf, adDays, datasetOf } from "@/lib/ads/__fixtures__/ad-days";
import { adPeriodOf, buildAdReport } from "@/lib/data/views/ads";
import type { AdVerdict } from "@/lib/domain/ads";

/** 28 günlük dönem = 28 kapanmış gün + açık gün (bugün karara girmez). */
const period = adPeriodOf(NOW, 28);
const valueAccount = accountOf(VALUE_GOAL);

/** Tek reklamlı hesap için karar; baz çizgisi için sabit sağlıklı ikinci reklam eklenir. */
function verdictOf(rows: ReturnType<typeof adDays>, opts: { liveDays?: number; goal?: typeof VALUE_GOAL | undefined; rules?: Parameters<typeof buildAdReport>[3] } = {}): AdVerdict {
  const account = "goal" in opts ? accountOf(opts.goal) : valueAccount;
  const data = datasetOf(account, {
    probe: { liveDays: opts.liveDays ?? 28, rows },
    peer: { liveDays: 28, rows: adDays("peer", 28, { resultValue: 400 }) },
  });
  const verdict = buildAdReport(data, account, period, opts.rules).ads.find((item) => item.ad.id === "probe")?.verdict;
  if (verdict === undefined) throw new Error("probe reklamı raporda yok");
  return verdict;
}

describe("kabul — 6 senaryo", () => {
  it("senaryo 1: artır — hedefin 1,2 katı üstü, istikrarlı", () => {
    expect(verdictOf(adDays("probe", 28, { resultValue: 450 }))).toMatchObject({ status: "scale", reasons: ["scale_above_target"], confidence: "high" });
  });
  it("senaryo 2: azalt — başabaşın üstünde ama hedefin %70'i altında", () => {
    expect(verdictOf(adDays("probe", 28, { resultValue: 205 }))).toMatchObject({ status: "reduce", reasons: ["reduce_below_target"] });
  });
  it("senaryo 3: kapat — getiri başabaş (1 / brüt kâr payı) altında", () => {
    expect(verdictOf(adDays("probe", 28, { resultValue: 150 }))).toMatchObject({ status: "stop", reasons: ["stop_below_break_even"] });
  });
  it("senaryo 4: yoruldu — sıklık yüksek, tıklama oranı ilk 7 günden son 7 güne %25+ düştü", () => {
    const rows = adDays("probe", 28, { resultValue: 330, frequency: 3.5 }, (i) => ({ clicks: i < 7 ? 30 : 15 }));
    expect(verdictOf(rows)).toMatchObject({ status: "fatigued", reasons: ["fatigued_frequency_and_drop"] });
  });
  it("senaryo 5: öğreniyor — yayına girmesi 3 gün", () => {
    expect(verdictOf(adDays("probe", 3, { resultValue: 450, results: 4 }), { liveDays: 3 })).toMatchObject({ status: "learning", reasons: ["learning_days", "learning_results"] });
  });
  it("senaryo 6: hedefsiz — hesapta hedef yok, karar yok", () => {
    expect(verdictOf(adDays("probe", 28, { resultValue: 450 }), { goal: undefined })).toMatchObject({ status: "undecided", reasons: ["goal_missing"] });
  });
});

describe("kabul — 4 kusur", () => {
  it("kusur 1: 2 sonuçlu küçük harcama stop almaz", () => {
    const rows = adDays("probe", 3, { spend: 10, results: 0, resultValue: 0 }, (i) => (i === 2 ? { results: 2, resultValue: 10 } : {}));
    // Varsayılan eşiklerle öğreniyor sayılır; öğrenme eşikleri kapatılsa bile sonuç kapısı "kapat" demez.
    expect(verdictOf(rows, { liveDays: 3 }).status).toBe("learning");
    const gated = verdictOf(rows, { liveDays: 3, rules: { learningMinDays: 0, learningMinResults: 0 } });
    expect(gated).toMatchObject({ status: "insufficient_data", reasons: ["stop_gate_few_results"] });
  });
  it("kusur 2: 28 günden kısa seride ani kötüleşme 'ölçülemedi' denir, 'kötüleşmedi' denmez", () => {
    const verdict = verdictOf(adDays("probe", 27, { resultValue: 450 }), { liveDays: 27 });
    expect(verdict.unmeasured).toContain("worsening:few_days");
  });
  it("kusur 3: tek günlük tıklama sıçraması yorgunluk sayılmaz", () => {
    const rows = adDays("probe", 28, { resultValue: 450, frequency: 3.5 }, (i, last) => (i === last ? { clicks: 2 } : {}));
    expect(verdictOf(rows).status).not.toBe("fatigued");
  });
  it("kusur 4: hedefsiz hesap, kötü rakamla bile undecided kalır (kapat denmez)", () => {
    expect(verdictOf(adDays("probe", 28, { resultValue: 50 }), { goal: undefined })).toMatchObject({ status: "undecided", reasons: ["goal_missing"] });
  });
});
