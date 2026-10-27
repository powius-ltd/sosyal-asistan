// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AiByline, AiSurface } from "@/components/common/ai-surface";

const surface = (container: HTMLElement) => container.querySelector('[data-slot="ai-surface"]') as HTMLElement;
const byline = (container: HTMLElement) => container.querySelector('[data-slot="ai-byline"]');

describe("AiSurface", () => {
  it("AI işareti biçimdir: sol kenar çizgisi + serif metin; künye kim · ne zaman · güven · kanıt sırasıyla", () => {
    const { container } = render(
      <AiSurface author="Pusula" when="2 saat önce" confidence="medium" evidenceCount={3}>
        Bu hafta iki videon tuttu.
      </AiSurface>,
    );
    expect(surface(container).className).toContain("border-l-2");
    expect(surface(container).className).toContain("border-ai-rule");
    expect(screen.getByText("Bu hafta iki videon tuttu.").className).toContain("font-voice");
    expect(byline(container)).toHaveTextContent("Pusula·2 saat önce·Güven: kısmen eminim·3 kanıt");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("verilmeyen parça yazılmaz; kanıt sayısı 0 ya da bilinmiyorsa 'kanıt' görünmez", () => {
    const { container } = render(
      <AiSurface author="Pusula" evidenceCount={0}>
        Metin
      </AiSurface>,
    );
    expect(byline(container)).toHaveTextContent("Pusula");
    expect(byline(container)).not.toHaveTextContent("kanıt");
    expect(byline(container)).not.toHaveTextContent("·");
  });

  it("künye bilgisi yoksa satır hiç çizilmez; `footer` künyeden sonra gelir", () => {
    const { container } = render(<AiSurface footer={<a href="/x">Aç</a>}>Metin</AiSurface>);
    expect(byline(container)).toBeNull();
    expect(screen.getByRole("link", { name: "Aç" })).toBeInTheDocument();
  });

  it("`filled` hafif zemin ekler; varsayılanda zemin yok (kutu değil)", () => {
    const plain = render(<AiSurface>Metin</AiSurface>);
    expect(surface(plain.container).className).not.toContain("bg-ai-surface");
    plain.unmount();
    const filled = render(<AiSurface filled>Metin</AiSurface>);
    expect(surface(filled.container).className).toContain("bg-ai-surface");
  });
});

describe("AiByline", () => {
  it("ek parça (rozet) künyenin sonuna eklenir", () => {
    const { container } = render(
      <AiByline author="Pusula diyor ki">
        <span>Eskidi</span>
      </AiByline>,
    );
    expect(byline(container)).toHaveTextContent("Pusula diyor ki·Eskidi");
  });
});
