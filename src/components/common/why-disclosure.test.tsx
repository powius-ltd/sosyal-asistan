// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { EvidenceChip, WhyDisclosure } from "@/components/common/why-disclosure";

describe("WhyDisclosure", () => {
  it("kapalı başlar; 'Neden?' ≥ 44 px dokunma hedefidir ve tıklanınca kanıt zemininde açılır", async () => {
    const user = userEvent.setup();
    render(
      <WhyDisclosure>
        <p>Gerekçe</p>
      </WhyDisclosure>,
    );
    const summary = screen.getByText("Neden?");
    const details = summary.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(summary.className).toContain("min-h-11");
    await user.click(summary);
    expect(details.open).toBe(true);
    const content = details.querySelector('[data-slot="why-content"]') as HTMLElement;
    expect(within(content).getByText("Gerekçe")).toBeInTheDocument();
    expect(content.className).toContain("bg-evidence-surface");
  });

  it("etiket değiştirilebilir; `surface={false}` kanıt zemini çizmez", () => {
    render(
      <WhyDisclosure label="+2 iş daha" surface={false}>
        <p>İçerik</p>
      </WhyDisclosure>,
    );
    const details = screen.getByText("+2 iş daha").closest("details") as HTMLDetailsElement;
    expect(details.querySelector('[data-slot="why-content"]')?.className).not.toContain("bg-evidence-surface");
  });
});

describe("EvidenceChip", () => {
  it("bağlantı ≥ 44 × 44 px dokunma alanıdır", () => {
    render(<EvidenceChip href="/video/ci_1">1. video</EvidenceChip>);
    const link = screen.getByRole("link", { name: "1. video" });
    expect(link).toHaveAttribute("href", "/video/ci_1");
    expect(link.className).toContain("min-h-11");
    expect(link.className).toContain("min-w-11");
  });
});
