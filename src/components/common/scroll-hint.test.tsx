// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScrollHint, ScrollTable } from "@/components/common/scroll-hint";

describe("ScrollHint", () => {
  it("kaydırılabilen alan adı olan bir bölgedir ve klavyeyle odaklanır", () => {
    render(
      <ScrollHint label="Geniş tablo">
        <div>içerik</div>
      </ScrollHint>,
    );
    const region = screen.getByRole("region", { name: "Geniş tablo" });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("taşma yokken ipucu çizilmez (jsdom'da boyut yok)", () => {
    render(
      <ScrollHint label="Tablo">
        <div>içerik</div>
      </ScrollHint>,
    );
    expect(screen.queryByText(/Yana kaydırarak/)).not.toBeInTheDocument();
  });

  it("ScrollTable tek kaydırıcı kullanır: ui/table'ın kendi kaydırma kabı yok", () => {
    const { container } = render(
      <ScrollTable label="Tablo">
        <tbody>
          <tr>
            <td>x</td>
          </tr>
        </tbody>
      </ScrollTable>,
    );
    expect(container.querySelector("[data-slot='table-container']")).toBeNull();
    expect(container.querySelectorAll("[role='region']")).toHaveLength(1);
  });
});
