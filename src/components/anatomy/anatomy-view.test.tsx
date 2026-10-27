// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnatomyView } from "@/components/anatomy/anatomy-view";
import type { AnatomySelection } from "@/components/anatomy/selected-video";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildAnatomy } from "@/lib/anatomy/aggregate";
import { inputOf, video, type VideoSpec } from "@/lib/anatomy/test-fixtures";
import { deriveVideoAnatomy } from "@/lib/anatomy/video";
import type { Insights } from "@/lib/domain/insights";

const INSIGHTS: Insights = {
  scope: { days: 90, since: "2026-07-02T00:00:00.000Z", until: "2026-09-30T00:00:00.000Z", audienceTimeZone: "America/New_York" },
  rows: [],
  durationBuckets: { own: [], competitors: [] },
  ctaTypes: { own: [], competitors: [] },
  hookTypes: { own: [], competitors: [] },
  similarSize: { count: 0, handles: [] },
  unmeasured: [{ section: "hook_types", reason: "Analiz edilmiş video yok; hook türü ölçülemedi." }],
};

const SPECS: VideoSpec[] = [
  { id: "own1", own: true, lift: 1.1, durationSec: 92 },
  { id: "w1", lift: 4.2, durationSec: 92 },
  { id: "w2", lift: 3.5, durationSec: 92 },
];

function renderView(specs: VideoSpec[], selectedId?: string) {
  const report = buildAnatomy(inputOf(specs));
  let selection: AnatomySelection | undefined;
  if (selectedId) {
    const { item, analysis } = video(specs.find((s) => s.id === selectedId) as VideoSpec);
    const anatomy = analysis && deriveVideoAnatomy({ item, analysis });
    selection = anatomy && analysis ? { kind: "ok", contentId: selectedId, anatomy, evidenceVerified: analysis.evidenceVerified } : undefined;
  }
  return render(
    <TooltipProvider>
      <AnatomyView report={report} insights={INSIGHTS} selection={selection} />
    </TooltipProvider>,
  );
}

describe("AnatomyView", () => {
  it("seçici, faz çubuğu, reçete ve boyut tabloları çizilir; ölçülemeyen hücre tire + sebep (0 değil)", () => {
    const { container } = renderView(SPECS, "w1");

    expect(screen.getByRole("navigation", { name: "İncelenmiş videolar" })).toBeTruthy();
    expect(container.querySelectorAll("a[href^='/anatomi?video=']")).toHaveLength(3);
    expect(screen.getByRole("img", { name: /Faz çizelgesi: Açılış 0:00–0:16/ })).toBeTruthy();
    expect(Array.from(container.querySelectorAll("[data-phase]")).map((el) => el.getAttribute("data-phase"))).toEqual(["hook", "intro", "body", "cta"]);
    expect(screen.getByRole("heading", { name: "Tutan videoların ortak özellikleri" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Açılış cümlesi uzunluğu" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Videonun ortası" })).toBeTruthy();
    // Kendi ↔ tutan kıyası için gruplarda 3'ten az video var: değer yerine tire; sebep metin olarak değil ipucu olarak bağlı.
    const unmeasured = container.querySelectorAll("[data-state='unmeasured']");
    expect(unmeasured.length).toBeGreaterThan(0);
    expect(screen.getByText(/Senin videoların ile tutan videoların farkını henüz hesaplayamadım/)).toBeTruthy();
    // Karşılaştırma verisinden gelen tablo boşsa sebebi görünür; sebep panel jargonu taşıyorsa ("hook") genel cümleyle değişir.
    expect(screen.getAllByText("Bu bölüm için yeterli veri yok.").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/hook|CTA|kohort|lift/i);
  });

  it("incelenmiş video yoksa sebebiyle boş durum", () => {
    renderView([{ id: "x", noAnalysis: true }]);
    expect(screen.getByText("İncelenmiş video yok")).toBeTruthy();
    expect(screen.getByText("Kapsamda analizli (kanıtı doğrulanmış) video yok.")).toBeTruthy();
  });
});
