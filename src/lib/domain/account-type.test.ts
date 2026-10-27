import { describe, expect, it } from "vitest";

import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_PROFILE,
  DEFAULT_ACCOUNT_TYPE,
  MATRIX_KINDS,
  MIXED_CONTENT_MIX,
  accountTypeLabel,
  appliesAngleLabeling,
  isAccountType,
  matrixKindsOf,
  splitPlanSlots,
  toAccountType,
  usesMatrix,
} from "@/lib/domain/account-type";
import { CTA_TYPES } from "@/lib/domain/taxonomy";

describe("hesap türü sabitleri", () => {
  it("üç tür var; her tür için profil tam ve etiketler Türkçe", () => {
    expect([...ACCOUNT_TYPES]).toEqual(["business", "creator", "mixed"]);
    expect(Object.keys(ACCOUNT_TYPE_PROFILE).sort()).toEqual([...ACCOUNT_TYPES].sort());
    expect(accountTypeLabel("business")).toBe("İşletme / koç");
    expect(accountTypeLabel("creator")).toBe("İçerik üreticisi");
    expect(accountTypeLabel("mixed")).toBe("Karma: hem erişim hem satış");
    for (const type of ACCOUNT_TYPES) {
      const profile = ACCOUNT_TYPE_PROFILE[type];
      expect(profile.description.trim(), type).not.toBe("");
      expect(profile.purpose.trim(), type).not.toBe("");
      expect(profile.matrices.length, type).toBeGreaterThan(0);
      for (const kind of profile.matrices) expect(MATRIX_KINDS, type).toContain(kind);
    }
  });

  it("matrisler LİSTE: işletme açı × farkındalık, üretici konu × hook, karma ikisi; açı etiketlemesi üreticide yok", () => {
    expect(matrixKindsOf("business")).toEqual(["angle_funnel"]);
    expect(matrixKindsOf("creator")).toEqual(["topic_hook"]);
    expect(matrixKindsOf("mixed")).toEqual(["angle_funnel", "topic_hook"]);
    expect(appliesAngleLabeling("business")).toBe(true);
    expect(appliesAngleLabeling("creator")).toBe(false);
    expect(appliesAngleLabeling("mixed")).toBe(true);
    expect(usesMatrix("mixed", "angle_funnel") && usesMatrix("mixed", "topic_hook")).toBe(true);
    expect(usesMatrix("creator", "angle_funnel")).toBe(false);
    expect(usesMatrix("business", "topic_hook")).toBe(false);
    // Açı etiketlemesi ↔ açı matrisi tutarlı: etiket yalnız matrisini kullanan türde uygulanır.
    for (const type of ACCOUNT_TYPES) expect(appliesAngleLabeling(type), type).toBe(usesMatrix(type, "angle_funnel"));
  });

  it("CTA önerileri taksonomiden alt küme, tekrarsız, `none` içermez; üretici satış CTA'sı önermez; karma birleşimdir", () => {
    for (const type of ACCOUNT_TYPES) {
      const { ctaTypes } = ACCOUNT_TYPE_PROFILE[type];
      expect(ctaTypes.length, type).toBeGreaterThan(0);
      expect(new Set(ctaTypes).size, `${type}: tekrarsız`).toBe(ctaTypes.length);
      for (const cta of ctaTypes) {
        expect(CTA_TYPES, `${type}: ${cta}`).toContain(cta);
        expect(cta, `${type}: CTA yok bir öneri değil`).not.toBe("none");
      }
    }
    const business = ACCOUNT_TYPE_PROFILE.business;
    const creator = ACCOUNT_TYPE_PROFILE.creator;
    expect(creator.ctaTypes).toEqual(["follow", "save_share"]);
    for (const sales of ["comment_keyword", "dm", "book_call", "link_in_bio"] as const) expect(creator.ctaTypes).not.toContain(sales);
    expect(business.ctaTypes).toEqual(["comment_keyword", "dm", "link_in_bio", "book_call"]);
    expect([...ACCOUNT_TYPE_PROFILE.mixed.ctaTypes].sort()).toEqual([...business.ctaTypes, ...creator.ctaTypes].sort());
    // Taksonomide olmayan üretici çağrıları (seri, sohbet yorumu) metin olarak taşınır.
    expect(creator.ctaExtras.length).toBe(2);
    expect(business.ctaExtras).toEqual([]);
    expect(ACCOUNT_TYPE_PROFILE.mixed.ctaExtras).toEqual(creator.ctaExtras);
  });

  it("amaç metni: karma hem erişimi hem satışı anar", () => {
    const purpose = ACCOUNT_TYPE_PROFILE.mixed.purpose.toLocaleLowerCase("tr-TR");
    expect(purpose).toContain("erişim");
    expect(purpose).toContain("satış");
  });

  it("içerik karması: oranlar 0..1 ve toplamı 1; karma varsayılanı erişim %60 / satış %40", () => {
    for (const type of ACCOUNT_TYPES) {
      const { reach, sales } = ACCOUNT_TYPE_PROFILE[type].contentMix;
      expect(reach, type).toBeGreaterThanOrEqual(0);
      expect(sales, type).toBeGreaterThanOrEqual(0);
      expect(reach + sales, `${type}: toplam 1`).toBeCloseTo(1, 10);
    }
    expect(MIXED_CONTENT_MIX).toEqual({ reach: 0.6, sales: 0.4 });
    expect(ACCOUNT_TYPE_PROFILE.mixed.contentMix).toEqual(MIXED_CONTENT_MIX);
    expect(ACCOUNT_TYPE_PROFILE.business.contentMix).toEqual({ reach: 0, sales: 1 });
    expect(ACCOUNT_TYPE_PROFILE.creator.contentMix).toEqual({ reach: 1, sales: 0 });
  });

  it("splitPlanSlots: slotlar karmaya göre bölünür, toplam korunur; tek amaçlı türde hepsi o amaca gider", () => {
    expect(splitPlanSlots("mixed", 5)).toEqual({ reach: 3, sales: 2 });
    expect(splitPlanSlots("mixed", 10)).toEqual({ reach: 6, sales: 4 });
    expect(splitPlanSlots("mixed", 3)).toEqual({ reach: 2, sales: 1 });
    expect(splitPlanSlots("mixed", 0)).toEqual({ reach: 0, sales: 0 });
    expect(splitPlanSlots("business", 5)).toEqual({ reach: 0, sales: 5 });
    expect(splitPlanSlots("creator", 5)).toEqual({ reach: 5, sales: 0 });
    for (const type of ACCOUNT_TYPES) {
      for (let total = 0; total <= 14; total++) {
        const { reach, sales } = splitPlanSlots(type, total);
        expect(reach + sales, `${type} ${total}`).toBe(total);
        expect(reach >= 0 && sales >= 0, `${type} ${total}: negatif yok`).toBe(true);
      }
    }
    expect(() => splitPlanSlots("mixed", -1)).toThrow(RangeError);
    expect(() => splitPlanSlots("mixed", 2.5)).toThrow(RangeError);
  });

  it("isAccountType / toAccountType: tanınmayan, boş ve büyük harfli değer işletmeye düşer", () => {
    expect(isAccountType("creator")).toBe(true);
    expect(isAccountType("mixed")).toBe(true);
    expect(isAccountType("Creator")).toBe(false);
    expect(isAccountType(undefined)).toBe(false);
    expect(toAccountType("creator")).toBe("creator");
    expect(toAccountType("mixed")).toBe("mixed");
    expect(toAccountType("business")).toBe("business");
    for (const raw of [undefined, null, "", "agency", "CREATOR"]) expect(toAccountType(raw), String(raw)).toBe(DEFAULT_ACCOUNT_TYPE);
    expect(DEFAULT_ACCOUNT_TYPE).toBe("business");
  });
});
