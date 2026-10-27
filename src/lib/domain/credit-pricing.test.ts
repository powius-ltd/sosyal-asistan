import { describe, expect, it } from "vitest";

import { CREDIT_ITEMS, CREDIT_PRICE_VERSION, CREDIT_UNIT_PRICES, creditsFor, estimateJobCredits, PROVISIONAL_CREDIT_ITEMS, type CreditItem } from "@/lib/domain/credit-pricing";
import { JOB_KINDS } from "@/lib/domain/panel-job";

/** `docs/KREDI-PLAN.md` §4 tablosunun birebir kopyası (plan dosyası depoda olmayabilir: rakamlar burada sabitlenir). */
const PLAN_SECTION_4: Record<CreditItem, number> = {
  account_scan: 8, // Hesap tarama (25 Reels + profil), hesap başına
  video_review: 10, // Video inceleme (≤ 3 dk), video başına
  weekly_plan: 60, // Haftalık plan
  briefing: 4, // Brifing (notlar)
  chat_question: 3, // Sohbet sorusu
  measurement: 4, // Ölçüm koşusu
  studio_video: 400, // Stüdyo video (geçici)
};

describe("kredi fiyat tablosu", () => {
  it("plan §4 rakamlarıyla birebir aynıdır; her kalemin fiyatı var", () => {
    expect(CREDIT_UNIT_PRICES).toEqual(PLAN_SECTION_4);
    expect([...CREDIT_ITEMS].sort()).toEqual(Object.keys(PLAN_SECTION_4).sort());
  });

  it("fiyatlar pozitif tam sayıdır; yalnız stüdyo videosu geçici işaretli", () => {
    for (const item of CREDIT_ITEMS) {
      expect(Number.isInteger(CREDIT_UNIT_PRICES[item]), item).toBe(true);
      expect(CREDIT_UNIT_PRICES[item], item).toBeGreaterThan(0);
    }
    expect(PROVISIONAL_CREDIT_ITEMS).toEqual(["studio_video"]);
  });

  it("sürüm tarih biçimindedir", () => {
    expect(CREDIT_PRICE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("plan §4: tipik haftalık tur ≈ 196 kredi (4 hesap, 10 video, plan, notlar)", () => {
    expect(estimateJobCredits("routine", { accounts: 4, videos: 10, measureRuns: 0 })?.maxCredits).toBe(4 * 8 + 10 * 10 + 60 + 4);
    expect(estimateJobCredits("routine", { accounts: 4, videos: 10, measureRuns: 0 })?.maxCredits).toBe(196);
  });
});

describe("creditsFor", () => {
  it("birim × birim fiyat; geçersiz sayı → undefined", () => {
    expect(creditsFor("video_review", 3)).toBe(30);
    expect(creditsFor("video_review", 0)).toBe(0);
    expect(creditsFor("video_review", -1)).toBeUndefined();
    expect(creditsFor("video_review", 1.5)).toBeUndefined();
    expect(creditsFor("video_review", Number.NaN)).toBeUndefined();
  });
});

describe("estimateJobCredits", () => {
  it("toplama: hesap × 8, dökümle", () => {
    expect(estimateJobCredits("collect", { accounts: 5 })).toEqual({
      maxCredits: 40,
      lines: [{ item: "account_scan", units: 5, creditsPerUnit: 8, credits: 40, provisional: false }],
      priceVersion: CREDIT_PRICE_VERSION,
      provisional: false,
    });
  });

  it("ölçüm: ölçülecek hesap × 4; video inceleme: video × 10", () => {
    expect(estimateJobCredits("measure", { measureRuns: 2 })?.maxCredits).toBe(8);
    expect(estimateJobCredits("analyze", { videos: 19 })?.maxCredits).toBe(190);
  });

  it("plan 60 ve notlar 4 sabittir; birim sayısı gerekmez", () => {
    expect(estimateJobCredits("plan")?.maxCredits).toBe(60);
    expect(estimateJobCredits("briefing")?.maxCredits).toBe(4);
  });

  it("açı etiketleme video incelemesine dahildir: 0 kredi, boş döküm (bilinen sıfır)", () => {
    expect(estimateJobCredits("label")).toMatchObject({ maxCredits: 0, lines: [] });
  });

  it("birim sayısı bilinmiyorsa undefined (0 değil)", () => {
    expect(estimateJobCredits("collect")).toBeUndefined();
    expect(estimateJobCredits("collect", { videos: 3 })).toBeUndefined();
    expect(estimateJobCredits("analyze", {})).toBeUndefined();
    expect(estimateJobCredits("measure", { accounts: 2 })).toBeUndefined();
  });

  it("geçersiz birim sayısı (negatif, kesirli, sonlu değil) bilinmiyor sayılır", () => {
    expect(estimateJobCredits("collect", { accounts: -1 })).toBeUndefined();
    expect(estimateJobCredits("collect", { accounts: 2.5 })).toBeUndefined();
    expect(estimateJobCredits("analyze", { videos: Number.POSITIVE_INFINITY })).toBeUndefined();
  });

  it("birim sayısı 0 ise iş 0 kredidir ve kalem dökümde yazılmaz", () => {
    expect(estimateJobCredits("collect", { accounts: 0 })).toMatchObject({ maxCredits: 0, lines: [] });
  });

  it("haftalık tur: bilinmeyen tek birim bile tahmini undefined yapar (kısmi toplam 'en çok' olamaz)", () => {
    expect(estimateJobCredits("routine", { accounts: 4, videos: 10 })).toBeUndefined();
    expect(estimateJobCredits("routine", { accounts: 4, measureRuns: 1 })).toBeUndefined();
  });

  it("haftalık tur dökümü: sıfır birimli kalem yazılmaz, toplam satırların toplamı", () => {
    const estimate = estimateJobCredits("routine", { accounts: 4, videos: 0, measureRuns: 1 });
    expect(estimate?.lines.map((line) => line.item)).toEqual(["account_scan", "weekly_plan", "measurement", "briefing"]);
    expect(estimate?.maxCredits).toBe(32 + 60 + 4 + 4);
    expect(estimate?.maxCredits).toBe(estimate?.lines.reduce((sum, line) => sum + line.credits, 0));
  });

  it("her iş türü için tanımlıdır (yeni tür kredi tablosuna eklenmeden derlenmez ama burada da sınanır)", () => {
    for (const kind of JOB_KINDS) {
      expect(estimateJobCredits(kind, { accounts: 1, videos: 1, measureRuns: 1 }), kind).toBeDefined();
    }
  });
});
