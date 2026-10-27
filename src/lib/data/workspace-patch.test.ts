import { describe, expect, it } from "vitest";

import { MAX_CAP_USD, NICHE_BRIEF_MAX_LENGTH } from "@/lib/data/queries";
import { parseWorkspacePatch, workspacePatchSchema } from "@/lib/data/workspace-patch";

describe("workspacePatchSchema", () => {
  it("boş yama geçerli; tavan 0 geçerlidir (harcama kapalı)", () => {
    expect(workspacePatchSchema.parse({})).toEqual({});
    const zero = workspacePatchSchema.parse({ apifyMonthlyCapUsd: 0, nicheBrief: "" });
    expect(zero.apifyMonthlyCapUsd).toBe(0);
    expect(zero.llmMonthlyCapUsd).toBeUndefined();
    expect(zero.nicheBrief).toBe("");
  });

  it("tavan kaldırılamaz: null geçersizdir", () => {
    for (const patch of [{ apifyMonthlyCapUsd: null }, { llmMonthlyCapUsd: null }]) {
      const result = workspacePatchSchema.safeParse(patch);
      expect(result.success, JSON.stringify(patch)).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Tavan bir sayı olmalı.");
    }
  });

  it("tavan sınırı: 0 ve 1000 geçerli; negatif, 1000'in üstü, sonsuz, NaN ve metin reddedilir", () => {
    expect(workspacePatchSchema.safeParse({ apifyMonthlyCapUsd: MAX_CAP_USD }).success).toBe(true);
    for (const bad of [-1, MAX_CAP_USD + 0.01, Number.POSITIVE_INFINITY, Number.NaN, "5"]) {
      expect(workspacePatchSchema.safeParse({ llmMonthlyCapUsd: bad }).success, String(bad)).toBe(false);
    }
  });

  it("niş tanımını kırpar; 2000 karakter geçerli, 2001 reddedilir (kod noktası sayılır)", () => {
    expect(workspacePatchSchema.parse({ nicheBrief: "  kahve  " }).nicheBrief).toBe("kahve");
    expect(workspacePatchSchema.safeParse({ nicheBrief: "a".repeat(NICHE_BRIEF_MAX_LENGTH) }).success).toBe(true);
    expect(workspacePatchSchema.safeParse({ nicheBrief: "a".repeat(NICHE_BRIEF_MAX_LENGTH + 1) }).success).toBe(false);
    // Çift birimli (surrogate çifti) karakterler tek karakter sayılır.
    expect(workspacePatchSchema.safeParse({ nicheBrief: "\u{1F600}".repeat(NICHE_BRIEF_MAX_LENGTH) }).success).toBe(true);
  });
});

describe("workspacePatchSchema: uyum bölgesi", () => {
  it("TR, US ve TR_US geçerli; başka değer, boş metin ve null reddedilir; verilmezse yamada yok", () => {
    for (const region of ["TR", "US", "TR_US"]) expect(workspacePatchSchema.parse({ complianceRegion: region }).complianceRegion).toBe(region);
    for (const bad of ["EU", "tr", "", null, 1]) expect(workspacePatchSchema.safeParse({ complianceRegion: bad }).success, String(bad)).toBe(false);
    expect(workspacePatchSchema.parse({ nicheBrief: "x" })).not.toHaveProperty("complianceRegion");
  });
});

describe("measureMonthlyCapUsd (aylık ölçüm tavanı)", () => {
  it("0..MAX_CAP_USD geçerli (0 = ölçüm kapalı); verilmeyen = dokunma", () => {
    expect(workspacePatchSchema.parse({ measureMonthlyCapUsd: 0.5 }).measureMonthlyCapUsd).toBe(0.5);
    expect(workspacePatchSchema.parse({ measureMonthlyCapUsd: 0 }).measureMonthlyCapUsd).toBe(0);
    expect(workspacePatchSchema.parse({ nicheBrief: "x" })).not.toHaveProperty("measureMonthlyCapUsd");
  });

  it("negatif, sınır üstü, sonsuz, NaN, metin ve null (tavan kaldırılamaz) reddedilir", () => {
    for (const bad of [-1, 1001, Number.POSITIVE_INFINITY, Number.NaN, "0,5", null]) {
      expect(workspacePatchSchema.safeParse({ measureMonthlyCapUsd: bad }).success, String(bad)).toBe(false);
    }
  });
});

describe("parseWorkspacePatch", () => {
  it("geçersiz yamada invalid_input fırlatır", () => {
    expect(() => parseWorkspacePatch({ apifyMonthlyCapUsd: -5 })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() => parseWorkspacePatch(null)).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });

  it("geçerli yamayı temizlenmiş haliyle döndürür", () => {
    expect(parseWorkspacePatch({ nicheBrief: " x " })).toEqual({ nicheBrief: "x" });
  });
});
