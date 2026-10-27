// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConfidenceMeter } from "@/components/common/confidence-meter";

const filledOf = (container: HTMLElement) => container.querySelectorAll('[data-filled="true"]').length;

describe("ConfidenceMeter", () => {
  it("düzeyi dolu dilim sayısıyla gösterir: eminim 3, kısmen 2, az örnek 1 (hep 3 dilim)", () => {
    for (const [level, filled] of [["high", 3], ["medium", 2], ["low", 1]] as const) {
      const { container, unmount } = render(<ConfidenceMeter level={level} />);
      expect(container.querySelectorAll("[data-filled]")).toHaveLength(3);
      expect(filledOf(container)).toBe(filled);
      expect(container.querySelector("[data-confidence]")).toHaveAttribute("data-confidence", level);
      unmount();
    }
  });

  it("düz dil yazısı görünür; dilimler ekran okuyucudan gizli, ad 'Güven: …' diye okunur", () => {
    const { container } = render(<ConfidenceMeter level="medium" />);
    expect(screen.getByText("kısmen eminim")).toBeInTheDocument();
    expect(container.querySelector("[data-confidence]")).toHaveTextContent("Güven: kısmen eminim");
    expect(container.querySelector("[data-filled]")?.parentElement).toHaveAttribute("aria-hidden", "true");
  });

  it("dolu ve boş dilim aynı renk ailesinden iki belirteçtir (düzey renkle anlatılmaz)", () => {
    const { container } = render(<ConfidenceMeter level="low" />);
    const classes = [...container.querySelectorAll("[data-filled]")].map((el) => el.className);
    expect(classes[0]).toContain("bg-confidence-fill");
    expect(classes[1]).toContain("bg-confidence-track");
    expect(classes[2]).toContain("bg-confidence-track");
  });
});
