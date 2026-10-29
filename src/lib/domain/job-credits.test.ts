import { describe, expect, it } from "vitest";

import { isCreditsEnforced } from "@/lib/credits/enforcement";
import { CREDIT_UNIT_PRICES } from "@/lib/domain/credit-pricing";
import { CREDIT_HOLD_MAX, CREDIT_KEY_PATTERN } from "@/lib/domain/credits";
import { chargeOf, JOB_CREDIT_UNIT_CAPS, jobCreditCeiling, jobCreditKey, jobHoldCredits, jobSpendsCredits } from "@/lib/domain/job-credits";
import { JOB_KINDS } from "@/lib/domain/panel-job";
import { DEFAULT_ANALYZE_LIMIT } from "@/lib/intel/analysis-select";

describe("iş kredi tavanı (güvenli üst sınır)", () => {
  it("birim tavanları: video tavanı incelemenin panel tavanıyla aynı", () => {
    expect(JOB_CREDIT_UNIT_CAPS.videos).toBe(DEFAULT_ANALYZE_LIMIT);
    expect(JOB_CREDIT_UNIT_CAPS).toEqual({ accounts: 25, videos: 19, measureRuns: 3 });
  });

  it("tür başına tavan = birim tavanı × birim fiyat; sabit kalemler bir kez", () => {
    expect(jobCreditCeiling("collect")).toBe(25 * CREDIT_UNIT_PRICES.account_scan);
    expect(jobCreditCeiling("measure")).toBe(3 * CREDIT_UNIT_PRICES.measurement);
    expect(jobCreditCeiling("analyze")).toBe(19 * CREDIT_UNIT_PRICES.video_review);
    expect(jobCreditCeiling("plan")).toBe(CREDIT_UNIT_PRICES.weekly_plan);
    expect(jobCreditCeiling("briefing")).toBe(CREDIT_UNIT_PRICES.briefing);
    expect(jobCreditCeiling("label"), "açı etiketi incelemenin içindedir").toBe(0);
  });

  it("haftalık tur: hesap taraması yalnız tur toplama yapacaksa (USD onayı) sayılır", () => {
    const withoutCollect = 19 * 10 + 60 + 4;
    expect(jobCreditCeiling("routine")).toBe(withoutCollect);
    expect(jobCreditCeiling("routine", { collects: false })).toBe(withoutCollect);
    expect(jobCreditCeiling("routine", { collects: true })).toBe(withoutCollect + 25 * 8);
  });

  it("tavanlar ayırma üst sınırının içinde; kredi harcamayanlar label, measure_zernio ve order", () => {
    for (const kind of JOB_KINDS) expect(jobCreditCeiling(kind, { collects: true }), kind).toBeLessThanOrEqual(CREDIT_HOLD_MAX);
    expect(JOB_KINDS.filter((kind) => !jobSpendsCredits(kind))).toEqual(["label", "measure_zernio", "order", "order_return", "publish", "ads_sync", "produce"]);
  });

  it("ayrılacak kredi: onaylanan tutar tavanı AŞAMAZ; kredi harcamayan türde ayırma yok", () => {
    expect(jobHoldCredits("analyze")).toBe(190);
    expect(jobHoldCredits("analyze", { approved: 30 })).toBe(30);
    expect(jobHoldCredits("analyze", { approved: 5000 }), "tavana iner").toBe(190);
    expect(jobHoldCredits("label")).toBeUndefined();
    expect(jobHoldCredits("label", { approved: 10 })).toBeUndefined();
  });

  it("ayırma anahtarı defterin anahtar biçimine uyar", () => {
    const key = jobCreditKey("33333333-3333-4333-8333-333333333333");
    expect(key).toBe("job:33333333-3333-4333-8333-333333333333");
    expect(CREDIT_KEY_PATTERN.test(key)).toBe(true);
  });

  it("chargeOf: kalem × birim fiyat toplamı; boş birim 0", () => {
    expect(chargeOf({})).toBe(0);
    expect(chargeOf({ video_review: 3, briefing: 1, account_scan: 2 })).toBe(30 + 4 + 16);
    expect(chargeOf({ video_review: undefined, weekly_plan: 1 })).toBe(60);
    expect(chargeOf({ video_review: -1 }), "geçersiz sayı sayılmaz").toBe(0);
  });
});

describe("kredi zorlaması anahtarı", () => {
  it("yalnız CREDITS_ENFORCED=on açar; tanımsız ve başka her değer KAPALI", () => {
    expect(isCreditsEnforced({})).toBe(false);
    for (const value of ["", "off", "1", "true", "yes", "açık"]) expect(isCreditsEnforced({ CREDITS_ENFORCED: value }), value).toBe(false);
    for (const value of ["on", "ON", " on "]) expect(isCreditsEnforced({ CREDITS_ENFORCED: value }), value).toBe(true);
  });
});
