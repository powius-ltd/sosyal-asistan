// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Progress } from "@/components/ui/progress";

describe("Progress", () => {
  it("aria-valuetext çalışma zamanı diline bağlı değil: her zaman tr-TR (%44)", () => {
    // Sunucu ile tarayıcının varsayılan Intl dili farklı olabilir (sunucu "%44", tarayıcı "44%");
    // sabit dil, hydration uyuşmazlığını (aria-valuetext) önler.
    render(<Progress value={44} aria-label="Kullanım" />);
    expect(screen.getByRole("progressbar", { name: "Kullanım" })).toHaveAttribute("aria-valuetext", "%44");
  });

  it("locale açıkça verilirse ona uyar", () => {
    render(<Progress value={44} aria-label="Kullanım" locale="en-US" />);
    expect(screen.getByRole("progressbar", { name: "Kullanım" })).toHaveAttribute("aria-valuetext", "44%");
  });
});
