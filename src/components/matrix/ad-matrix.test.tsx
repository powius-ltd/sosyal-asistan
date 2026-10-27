// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));

import { CreativeMatrixSection } from "@/components/matrix/creative-matrix-section";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AdCreativeOutcome } from "@/lib/domain/ads";
import { buildCreativeMatrix } from "@/lib/matrix/build";
import { matrixInput, rivals, SLOT, type Made } from "@/lib/matrix/test-fixtures";

const SPECS: Made[] = [...rivals(3, 4, SLOT, { hookType: "question" }), { id: "mine", own: true, lift: 1.4, cell: ["cozum-ariyor", "sonuc-kazanim"] }];
const worked: AdCreativeOutcome = {
  adId: "ad-1",
  name: "Deneme reklamı",
  sourceContentId: "mine",
  outcome: "worked",
  confidence: "high",
  spend: { amount: 120, currency: "TRY" },
  costVsBaseline: 0.7,
};
const OWN_CELL = { stage: "cozum-ariyor", angle: "sonuc-kazanim" } as const;

function renderMatrix(ads: boolean, operator: boolean, selected?: typeof OWN_CELL) {
  const matrix = buildCreativeMatrix(matrixInput(SPECS, ads ? { ads: { creatives: [worked], unlabeledAdCount: 2 } } : {}));
  return render(
    <TooltipProvider>
      <CreativeMatrixSection matrix={matrix} selected={selected} operator={operator} />
    </TooltipProvider>,
  );
}

describe("CreativeMatrixSection: reklam işareti", () => {
  it("yönetici: tutan kutuda 'Reklamda tuttu', fırsat satırında 'Reklamda denenmedi', etiketsiz reklam notu", () => {
    const { container } = renderMatrix(true, true);
    expect(container.querySelectorAll("[data-ad-signal='worked']")).toHaveLength(1);
    expect(container.querySelectorAll("[data-ad-signal='untested']").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("matrix-unlabeled-ads").textContent).toContain("2 reklamın hangi yaklaşıma girdiği bilinmiyor");
  });

  it("yönetici: kutu ayrıntısında üç kaynak, örnek reklam bağlantısı ve para cümlesi", () => {
    renderMatrix(true, true, OWN_CELL);
    expect(screen.getByTestId("matrix-three-sources")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Deneme reklamı" });
    expect(link.getAttribute("href")).toBe("/reklamlar/ad-1");
    expect(screen.getByTestId("ad-sample-money").textContent).toContain("0,7");
    expect(screen.getByTestId("ad-operator-summary").textContent).toContain("harcama");
  });

  it("müşteri görünümü: reklam rozeti, ayrıntı, para ve etiketsiz reklam notu yok", () => {
    const { container } = renderMatrix(true, false, OWN_CELL);
    expect(container.querySelectorAll("[data-ad-signal]")).toHaveLength(0);
    expect(screen.queryByTestId("matrix-ad-detail")).toBeNull();
    expect(screen.queryByTestId("matrix-unlabeled-ads")).toBeNull();
    expect(container.textContent).not.toMatch(/Reklamda|harcama|reklam/);
  });

  it("reklam hesabı olmayan çalışma alanı: yönetici görünümü de reklamsız öncekiyle aynı", () => {
    // React'in ürettiği kimlikler (`useId`) çizimden çizime değişir; yapı karşılaştırması onlarsız yapılır.
    const html = (container: HTMLElement) => container.innerHTML.replace(/(_r_|:r)[0-9a-z]+(_|:)/g, "");
    const withoutOperator = html(renderMatrix(false, true, OWN_CELL).container);
    const withoutCustomer = html(renderMatrix(false, false, OWN_CELL).container);
    expect(withoutOperator).toBe(withoutCustomer);
    expect(withoutOperator).not.toMatch(/data-ad-signal|Reklam/);
  });
});
