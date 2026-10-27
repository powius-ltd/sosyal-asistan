// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ShadowCostNote } from "@/components/settings/shadow-cost-note";
import { PROVIDER_PRICE_VERSION } from "@/lib/domain/provider-pricing";

const shadow = (patch: Partial<Parameters<typeof ShadowCostNote>[0]["shadow"]> = {}) => ({ usd: 0.795, pricedRuns: 3, unpricedRuns: 1, unlistedRuns: 0, priceVersion: PROVIDER_PRICE_VERSION, ...patch });

describe("ShadowCostNote", () => {
  it("tutar, çağrı sayısı ve token'ı olmayan çağrı sayısını yazar", () => {
    render(<ShadowCostNote shadow={shadow()} calls={4} />);
    const note = document.querySelector("[data-slot='shadow-cost']");
    expect(note?.textContent).toMatch(/API fiyatıyla tutardı:\s*≈\s*\$0,80/);
    expect(note?.textContent).toContain("4 çağrı, 1 çağrının token sayısı yok");
    expect(note?.textContent).toContain(PROVIDER_PRICE_VERSION);
  });

  it("token'sız çağrı ile modeli fiyat tablosunda olmayan çağrı AYRI sayılır", () => {
    render(<ShadowCostNote shadow={shadow({ pricedRuns: 2, unpricedRuns: 3, unlistedRuns: 2 })} calls={5} />);
    expect(document.body.textContent).toContain("5 çağrı, 1 çağrının token sayısı yok, 2 çağrının modeli fiyat tablosunda yok");
  });

  it("yalnız modeli tanınmayan çağrı varsa 'token sayısı yok' denmez", () => {
    render(<ShadowCostNote shadow={shadow({ unpricedRuns: 1, unlistedRuns: 1 })} calls={4} />);
    expect(document.body.textContent).toContain("4 çağrı, 1 çağrının modeli fiyat tablosunda yok");
    expect(document.body.textContent).not.toContain("token sayısı yok");
  });

  it("açıklama model adının kaydedildiğini söyler (eski 'yazılmıyor' notu yok)", () => {
    render(<ShadowCostNote shadow={shadow()} calls={4} />);
    expect(document.body.textContent).toContain("kaydedilen modelin fiyatıyla");
    expect(document.body.textContent).not.toContain("yazılmıyor");
  });

  it("hepsinin token'ı varsa 'token sayısı yok' eki çıkmaz", () => {
    render(<ShadowCostNote shadow={shadow({ unpricedRuns: 0, pricedRuns: 4 })} calls={4} />);
    expect(document.body.textContent).toContain("(4 çağrı)");
    expect(document.body.textContent).not.toContain("token sayısı yok");
  });

  it("tutar bilinmiyorsa tire + sebep (0 yazılmaz)", () => {
    render(<ShadowCostNote shadow={shadow({ usd: undefined, pricedRuns: 0, unpricedRuns: 2 })} calls={2} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(document.body.textContent).toContain("Hiçbir çağrının fiyatı hesaplanamadı");
    expect(document.body.textContent).not.toMatch(/\$0[,.]00|≈ 0/);
  });

  it("hiç abonelik çağrısı yoksa hiçbir şey çizmez", () => {
    const { container } = render(<ShadowCostNote shadow={shadow({ usd: undefined, pricedRuns: 0, unpricedRuns: 0 })} calls={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
