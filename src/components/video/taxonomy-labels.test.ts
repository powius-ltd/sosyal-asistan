import { describe, expect, it } from "vitest";

import { labelKeyLabel, labelValueLabel, sectionTypeLabel } from "@/components/video/taxonomy-labels";

describe("taxonomy-labels", () => {
  it("bilinen anahtarları domain sözlüğünden Türkçeye çevirir (2026-10-v1 bölümleri dahil)", () => {
    expect(sectionTypeLabel("cta")).toBe("Harekete çağrı");
    expect(sectionTypeLabel("story")).toBe("Hikaye");
    expect(sectionTypeLabel("practice")).toBe("Uygulama");
    expect(labelKeyLabel("topic")).toBe("Konu");
    expect(labelKeyLabel("frame")).toBe("Çerçeve");
    expect(labelKeyLabel("cta_type")).toBe("İzleyiciden istenen şey");
    expect(sectionTypeLabel("hook")).toBe("Açılış");
  });

  it("eski taksonomideki `value` bölümü okunur kalır", () => {
    expect(sectionTypeLabel("value")).toBe("Değer");
  });

  it("bilinmeyen anahtarı okunur hale getirir", () => {
    expect(sectionTypeLabel("ilk_adim")).toBe("İlk adim");
    expect(labelKeyLabel("constructor")).toBe("Constructor");
  });

  it("kapalı listeli eksenlerin değerini çevirir; serbest metin eksenlerine dokunmaz", () => {
    expect(labelValueLabel("frame", "faith")).toBe("İnanç / maneviyat");
    expect(labelValueLabel("cta_type", "comment_keyword")).toBe("Yorum anahtar kelimesi");
    expect(labelValueLabel("cta_type", "yeni_tur")).toBe("yeni_tur");
    expect(labelValueLabel("topic", "sabah rutini")).toBe("sabah rutini");
    expect(labelValueLabel("constructor", "faith")).toBe("faith");
  });
});
