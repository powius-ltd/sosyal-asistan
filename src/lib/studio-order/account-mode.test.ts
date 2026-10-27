import { describe, expect, it } from "vitest";

import { resolveOrderAccount, slugifyAccount } from "@/lib/studio-order/account-mode";

describe("resolveOrderAccount", () => {
  it("stüdyoda tanımlı hesapta stüdyonun slug'ı ve modu geçer (fikirden bağımsız)", () => {
    expect(resolveOrderAccount({ panelSlug: "ornekstudyoapp", hasScript: false })).toEqual({ slug: "ornek-studyo", mode: "senaryo", inStudio: true });
    expect(resolveOrderAccount({ panelSlug: "ornek-marka", hasScript: true })).toEqual({ slug: "ornek-marka", mode: "konu", inStudio: true });
  });

  it("tanımsız hesapta hata atmaz: senaryo varsa senaryo, yoksa konu", () => {
    expect(resolveOrderAccount({ panelSlug: "ornek", hasScript: true })).toEqual({ slug: "ornek", mode: "senaryo", inStudio: false });
    expect(resolveOrderAccount({ panelSlug: "ornek", hasScript: false })).toEqual({ slug: "ornek", mode: "konu", inStudio: false });
  });

  it("slug yoksa @handle'dan, o da yoksa undefined", () => {
    expect(resolveOrderAccount({ handle: "@Ornek.Özkan", hasScript: false })?.slug).toBe("ornek-ozkan");
    expect(resolveOrderAccount({ hasScript: false })).toBeUndefined();
    expect(resolveOrderAccount({ panelSlug: "!!!", hasScript: false })).toBeUndefined();
  });

  it("slugifyAccount Türkçe harfi düzleştirir", () => {
    expect(slugifyAccount("Şimşek Çiçek")).toBe("simsek-cicek");
  });

});
