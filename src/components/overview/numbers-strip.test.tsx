// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NumbersStrip } from "@/components/overview/numbers-strip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeOverview } from "@/lib/overview/test-fixtures";

const wrap = (ui: React.ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);
const tile = (label: string) => screen.getByText(label).closest("div") as HTMLElement;

describe("NumbersStrip", () => {
  it("üç sayıyı gösterir: takipçi, izlenme, tutan videon (kendi tutanların sayısı)", () => {
    wrap(<NumbersStrip overview={makeOverview({ followers: 14_316, views: 15_176, posts: 12, postsPrev: 8, viewsPrev: 10_000 })} ownOutliers={{ count: 6, bestLift: 5.9 }} />);
    const strip = screen.getByRole("region", { name: "Sayılar" });
    // Büyük sayı tek biçimle: kısaltma (rakip tablosundaki "14,9 B" ile aynı dil); kesin değer ekranda yok.
    expect(strip).toHaveTextContent("14,3 B");
    expect(strip).toHaveTextContent("15,2 B");
    expect(strip).not.toHaveTextContent("14.316");
    expect(strip).toHaveTextContent("Tutan videon");
    expect(within(strip).getByText("6")).toBeInTheDocument();
    // Önceki dönemde ≥ 3 yayın var: değişim söylenir.
    expect(strip).toHaveTextContent("önceki döneme göre +%51,8");
  });

  it("telefonda da dönem ve değişim görünür: kartların altında tek satır (D3-07)", () => {
    wrap(<NumbersStrip overview={makeOverview({ followers: 14_316, views: 15_176, posts: 12, postsPrev: 8, viewsPrev: 10_000 })} ownOutliers={{ count: 6 }} />);
    const line = screen.getByTestId("period-line");
    expect(line).toHaveTextContent("İzlenme: Son 30 gün · önceki döneme göre +%51,8");
    expect(line.className).toContain("sm:hidden");
  });

  it("önceki dönemde 3'ten az yayın varsa yüzde yazmaz (anlamsız oran)", () => {
    wrap(<NumbersStrip overview={makeOverview({ followers: 100, views: 22_477, posts: 20, postsPrev: 1, viewsPrev: 4 })} ownOutliers={{ count: 0 }} />);
    expect(screen.getByRole("region", { name: "Sayılar" })).not.toHaveTextContent(/%|önceki/);
  });

  it("ölçülemeyen sayı tire olur, 0 yazılmaz; tutan sıfırı yalnız izlenme ölçülmüşse sıfırdır", () => {
    wrap(<NumbersStrip overview={makeOverview({ followers: undefined, views: undefined })} ownOutliers={{ count: 0 }} />);
    expect(document.querySelectorAll('[data-state="unmeasured"]')).toHaveLength(3);
    expect(screen.getByRole("region", { name: "Sayılar" })).not.toHaveTextContent(/\b0\b/);
  });

  it("izlenme ölçülmüş ve tutan yoksa tutan videon 0'dır (gerçek sıfır)", () => {
    wrap(<NumbersStrip overview={makeOverview({ followers: 5, views: 100 })} ownOutliers={{ count: 0 }} />);
    expect(within(tile("Tutan videon")).getByText("0")).toBeInTheDocument();
  });

  it("tutan videolar okunamadıysa tire (bilinmiyor ≠ 0)", () => {
    wrap(<NumbersStrip overview={makeOverview({ followers: 5, views: 100 })} ownOutliers={undefined} />);
    expect(within(tile("Tutan videon")).getByText("—")).toBeInTheDocument();
  });
});
