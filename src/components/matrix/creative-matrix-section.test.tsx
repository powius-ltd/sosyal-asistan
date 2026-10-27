// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// İş düğmesinin sarmalayıcısı async sunucu bileşeni taşır (jsdom'da çizilmez): yer tutucuyla değişir; kapı ve yedek komut metni
// `components/workspace/job-command.test.tsx`'te sınanır.
vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));

import { CreativeMatrixSection } from "@/components/matrix/creative-matrix-section";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildCreativeMatrix } from "@/lib/matrix/build";
import { matrixInput, rivals, SLOT, type Made } from "@/lib/matrix/test-fixtures";

const SPECS: Made[] = [
  ...rivals(3, 4, SLOT, { hookType: "question" }),
  { id: "mine", own: true, lift: 1.4, cell: ["cozum-ariyor", "sonuc-kazanim"] },
  { id: "unlabeled", lift: 2 },
];

function renderSection(specs: Made[], selected?: Parameters<typeof CreativeMatrixSection>[0]["selected"]) {
  const matrix = buildCreativeMatrix(matrixInput(specs));
  return render(
    <TooltipProvider>
      <CreativeMatrixSection matrix={matrix} selected={selected} />
    </TooltipProvider>,
  );
}

describe("CreativeMatrixSection", () => {
  it("5 satır × 4 sütun = 20 kutu; fırsat vurgulu + metinle, boş soluk; fırsat cümlesi, sayaç; kutu bağlantısı; düz dil (panel jargonu yok)", () => {
    const { container } = renderSection(SPECS);

    expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(container.querySelectorAll("thead th[scope='col']")).toHaveLength(5); // köşe + 4 açı
    expect(container.querySelectorAll("a[href^='/anatomi?hucre=']")).toHaveLength(20 + 1); // 20 kutu + 1 fırsat satırı
    expect(container.querySelectorAll("[data-status='empty']")).toHaveLength(18);
    expect(container.querySelectorAll("[data-status='proven_opportunity']")).toHaveLength(1);
    expect(container.querySelectorAll("[data-status='tried']")).toHaveLength(1);

    // Renge ek olarak metin: durum etiketi ve zihinsel durum cümlesi.
    expect(screen.getAllByText("Rakipte tutuyor").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Yaklaşım haritası" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Denemediğin yaklaşımlar" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/hook|CTA|matris|hücre|lift|kademe|medyan|baz çizgisi|farkındalık/i);
    expect(screen.getByText("“Evet bu var ama ne yapacağımı bilmiyorum”")).toBeTruthy();
    expect(screen.getByText(/Acı \/ korku yaklaşımı · sorunu bilen izleyici: rakiplerde 3 video, tipik video normalinin 4,0 katı izlendi, 3 tanesi tutan, sen denemedin; beklenen uyum: iyi/)).toBeTruthy();
    expect(screen.getByTestId("matrix-counters").textContent).toContain("4 videoya baktım");
    expect(screen.getByTestId("matrix-counters").textContent).toContain("1 videoya henüz bakmadım");
    // Kısmen etiketli: sayacın altında TEK "Açıları etiketle" iş düğmesi; komut metni yok.
    expect(screen.getAllByRole("button", { name: "Açıları etiketle" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Açıları etiketle" })).toHaveAttribute("data-kind", "label");
    expect(container.textContent).not.toContain("npm run");
    expect(container.querySelector("a[href='/anatomi?hucre=sorunu-biliyor:aci-korku']")).toBeTruthy();
    // Boş kutuda normaline göre "0" değil: hiçbir hücre/ayrıntıda "0,0x" yok.
    expect(container.textContent).not.toContain("0,0x");
  });

  it("seçili kutunun ayrıntısı: örnek videolar içeriğe bağlanır; etiket yoksa boş durum + iş düğmesi; etiketsiz video yoksa düğme yok", () => {
    const { container, unmount } = renderSection(SPECS, { stage: "sorunu-biliyor", angle: "aci-korku" });
    const detail = within(screen.getByTestId("matrix-cell-detail"));
    expect(detail.getByText("Acı / korku yaklaşımı · sorunu bilen izleyici")).toBeTruthy();
    expect(container.querySelectorAll("[data-testid='matrix-cell-detail'] a[href^='/video/']")).toHaveLength(3);
    expect(container.querySelector("[data-selected]")?.getAttribute("data-status")).toBe("proven_opportunity");
    unmount();

    const empty = renderSection([{ id: "x", lift: 2 }]);
    expect(empty.container.querySelector("table")).toBeNull();
    expect(empty.container.textContent).toContain("Videolara henüz bakmadım");
    expect(empty.container.textContent).not.toContain("npm run");
    expect(screen.getAllByRole("button", { name: "Açıları etiketle" })).toHaveLength(1);
    empty.unmount();

    // Hepsi etiketli: etiketlenecek video yok, düğme çizilmez.
    renderSection(SPECS.filter((spec) => spec.id !== "unlabeled"));
    expect(screen.queryByRole("button", { name: "Açıları etiketle" })).not.toBeInTheDocument();
  });

  it("seçilen kutu ayrıntı panelini odak hedefi yapar; adresteki kutu haritada yoksa tek cümleyle söyler", () => {
    const { unmount } = renderSection(SPECS, { stage: "sorunu-biliyor", angle: "aci-korku" });
    const panel = screen.getByTestId("matrix-cell-detail");
    expect(panel).toHaveAttribute("id", "matrix-cell-detail");
    expect(panel).toHaveAttribute("tabindex", "-1");
    unmount();

    const matrix = buildCreativeMatrix(matrixInput(SPECS));
    render(
      <TooltipProvider>
        <CreativeMatrixSection matrix={matrix} requested />
      </TooltipProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Bu yaklaşım listede yok");
    expect(screen.queryByTestId("matrix-cell-detail")).not.toBeInTheDocument();
  });
});
