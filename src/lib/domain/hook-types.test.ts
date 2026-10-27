import { describe, expect, it } from "vitest";

import { HOOK_TYPES, hookTypeLabel, humanizeKey } from "@/lib/domain/hook-types";

describe("hookTypeLabel", () => {
  it("mock ve taksonomideki tüm hook türleri Türkçe", () => {
    expect(
      ["question", "list", "confession", "shock_stat", "pov", "mistake_warning", "comparison", "barrier_removal"].map(hookTypeLabel),
    ).toEqual(["Soru", "Liste", "İtiraf", "Şok istatistik", "POV", "Hata uyarısı", "Karşılaştırma", "Engel kaldırma"]);
  });

  it("2026-10-v1 yeni türleri: bold_claim, story_open, callout, affirmation, teaching_quote", () => {
    expect(["bold_claim", "story_open", "callout", "affirmation", "teaching_quote"].map(hookTypeLabel)).toEqual([
      "Cesur iddia",
      "Hikaye girişi",
      "Seslenme",
      "Olumlama",
      "Öğreti alıntısı",
    ]);
    expect(HOOK_TYPES).toHaveLength(13);
    expect(new Set(HOOK_TYPES).size).toBe(13);
    for (const key of HOOK_TYPES) expect(hookTypeLabel(key), key).not.toBe(humanizeKey(key));
  });

  it("bilinmeyen anahtar okunur hale gelir; Object.prototype anahtarlarında bozulmaz", () => {
    expect(hookTypeLabel("curiosity_gap")).toBe("Curiosity gap");
    expect(hookTypeLabel("constructor")).toBe("Constructor");
  });

  it("humanizeKey: alt çizgi → boşluk, ilk harf büyük (Türkçe)", () => {
    expect(humanizeKey("ilk_adim")).toBe("İlk adim");
  });
});
