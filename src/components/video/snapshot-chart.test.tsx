// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SnapshotChart } from "@/components/video/snapshot-chart";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

describe("SnapshotChart", () => {
  it("erişilebilir adı eğilim özetini taşır: ilk ve son ölçüm (tarihli) ile yön (Özet grafikleriyle aynı yardımcı)", () => {
    render(
      <SnapshotChart
        timeZone="UTC"
        points={[
          { capturedAt: "2026-09-01T10:00:00.000Z", views: 1200 },
          { capturedAt: "2026-09-03T10:00:00.000Z", views: 15_400 },
        ]}
      />,
    );
    expect(
      screen.getByRole("img", { name: "İzlenme zaman serisi grafiği. İlk ölçüm 1 Eyl 2026: 1.200. Son ölçüm 3 Eyl 2026: 15.400. Genel olarak yükseldi." }),
    ).toBeInTheDocument();
  });

  it("tek ölçümle özet kurulmaz: yalnız grafiğin adı okunur", () => {
    render(<SnapshotChart timeZone="UTC" points={[{ capturedAt: "2026-09-01T10:00:00.000Z", views: 1200 }]} />);
    expect(screen.getByRole("img", { name: "İzlenme zaman serisi grafiği" })).toBeInTheDocument();
  });
});
