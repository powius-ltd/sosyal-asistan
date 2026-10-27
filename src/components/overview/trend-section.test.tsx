// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NOT_ENOUGH_POINTS_TEXT, TrendSection } from "@/components/overview/trend-section";
import type { TrendSeries } from "@/lib/domain/overview";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const series = (key: TrendSeries["key"], label: string, values: (number | undefined)[]): TrendSeries => ({
  key,
  label,
  unit: "count",
  points: values.map((value, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, value })),
});

describe("TrendSection", () => {
  it("iki seride de 2'den az ölçüm noktası varsa grafik yerine tek cümle yazar", () => {
    render(
      <TrendSection
        trends={[series("followers", "Takipçi", [1_400_000]), series("views", "İzlenme", [undefined, undefined])]}
        days={30}
        scopeLabel="Tüm hesaplar"
      />,
    );
    expect(screen.getByText(NOT_ENOUGH_POINTS_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("Takipçi")).not.toBeInTheDocument();
  });

  it("serisi hiç gelmeyen de aynı cümleyi alır", () => {
    render(<TrendSection trends={[]} days={30} scopeLabel="Tüm hesaplar" />);
    expect(screen.getByText(NOT_ENOUGH_POINTS_TEXT)).toBeInTheDocument();
  });

  it("yalnız yeterli seri çizilir, yetersiz olanın kartında cümle durur", () => {
    render(
      <TrendSection
        trends={[series("followers", "Takipçi", [100, 110, 120]), series("views", "İzlenme", [50])]}
        days={30}
        scopeLabel="@hesap · Instagram"
      />,
    );
    // Grafiğin adı eğilim özetini taşır (D3-15): ilk / son ölçüm ve yön.
    expect(screen.getByRole("img", { name: /^Takipçi zaman serisi grafiği\. İlk ölçüm 1 Eyl 2026: 100\. Son ölçüm 3 Eyl 2026: 120\. Genel olarak yükseldi\.$/ })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^İzlenme zaman serisi grafiği/ })).not.toBeInTheDocument();
    expect(screen.getAllByText(NOT_ENOUGH_POINTS_TEXT)).toHaveLength(1);
  });
});
