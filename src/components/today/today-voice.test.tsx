// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TodayCalm } from "@/components/today/today-calm";
import { TodayVoice } from "@/components/today/today-voice";
import { NO_ASKS_TEXT } from "@/lib/overview/summary";
import type { TodayVoice as TodayVoiceModel } from "@/lib/today";

const NOW = new Date("2026-10-02T12:00:00Z");
const VOICE: TodayVoiceModel = {
  lead: "Bu hafta 6 videonu inceledim.",
  link: { label: "Hangileri?", href: "/icerikler" },
  note: {
    headline: "Soru ile açılan videoların daha iyi gidiyor",
    text: "Soru ile açtığın videolar normalinin 2,1 katı izlendi. Son üç videonda bu açılış vardı.",
    confidence: "medium",
    evidence: ["c:ci_048"],
    generatedAt: "2026-10-02T10:00:00Z",
  },
};

describe("TodayVoice", () => {
  it("cümle sayfanın başlığıdır (şablon + karar sayısı); notun başlığı ve İLK cümlesi altında, yaş künyesi tek satır", () => {
    render(<TodayVoice voice={VOICE} state={{ kind: "decisions", text: "2 kararın var." }} maskotName="Demirkazık" mascot="telling" now={NOW} />);
    const voice = screen.getByTestId("today-voice");
    expect(within(voice).getByRole("heading", { level: 1 })).toHaveTextContent("Bu hafta 6 videonu inceledim. 2 kararın var.");
    expect(within(voice).getByRole("heading", { name: VOICE.note?.headline })).toBeInTheDocument();
    expect(voice.querySelector('[data-byline="when"]')).toHaveTextContent("notlarım 2 saat önce");
    expect(within(voice).getByRole("img", { name: "Demirkazık anlatıyor" })).toBeInTheDocument();
    // Notun kalanı, güven ve kanıt "Neden?" içinde (kapalı).
    const details = within(voice).getByText("Neden?").closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details).toHaveTextContent("Son üç videonda bu açılış vardı.");
    expect(details).toHaveTextContent("kısmen eminim");
    expect(within(details).getByRole("link", { name: "video" })).toHaveAttribute("href", "/video/ci_048");
    expect(within(voice).getByRole("link", { name: /Hangileri\?/ })).toHaveAttribute("href", "/icerikler");
    expect(voice.querySelector('[data-slot="stale-note"]')).toBeNull();
  });

  it("müşteri kopyasında (plain) maskot ve \"diyor ki\" yok: düz Bugün başlığı + aynı tek cümle", () => {
    const { container } = render(<TodayVoice voice={VOICE} state={{ kind: "decisions", text: "2 kararın var." }} maskotName="Demirkazık" mascot="telling" now={NOW} plain />);
    const voice = screen.getByTestId("today-voice");
    expect(within(voice).getByRole("heading", { level: 1 })).toHaveTextContent("Bugün");
    expect(voice).toHaveTextContent("Bu hafta 6 videonu inceledim. 2 kararın var.");
    expect(container.querySelector('[data-slot="mascot"]')).toBeNull();
    expect(container).not.toHaveTextContent("Demirkazık");
  });

  it("notlar bayatsa uyarı satırı yazılır; karar yoksa karar sayısı cümlesi eklenmez; alt satır (veri tazeliği) verilirse yazılır", () => {
    const stale: TodayVoiceModel = { ...VOICE, note: VOICE.note && { ...VOICE.note, stale: { reason: "too_old", text: "Notlarım eski veriye dayanıyor." } } };
    render(
      <TodayVoice
        voice={stale}
        state={{ kind: "stale", text: "Notlarım eski veriye dayanıyor." }}
        maskotName="Demirkazık"
        mascot="waiting"
        now={NOW}
        caption="Hesabına son bakışım: 1 Eki"
      />,
    );
    const voice = screen.getByTestId("today-voice");
    expect(voice.querySelector('[data-slot="stale-note"]')).toHaveTextContent("Notlarım eski veriye dayanıyor.");
    expect(voice).not.toHaveTextContent("kararın var");
    expect(voice).toHaveTextContent("Hesabına son bakışım: 1 Eki");
  });

  it("not yoksa yalnız cümle; okunamayan yaş/güven uydurulmaz. Cümle de not da yoksa blok çizilmez", () => {
    const { unmount } = render(
      <TodayVoice voice={{ lead: "Hesabına henüz bakmadım." }} state={{ kind: "empty", text: "Hesabına henüz bakmadım." }} maskotName="Demirkazık" mascot="waiting" now={NOW} />,
    );
    const voice = screen.getByTestId("today-voice");
    expect(voice).toHaveTextContent("Hesabına henüz bakmadım.");
    expect(voice.querySelector('[data-byline="when"]')).toBeNull();
    expect(voice.querySelector("[data-confidence]")).toBeNull();
    expect(within(voice).queryByText("Neden?")).not.toBeInTheDocument();
    unmount();

    render(<TodayVoice voice={{}} state={{ kind: "clear", text: NO_ASKS_TEXT }} maskotName="Demirkazık" mascot="waiting" now={NOW} />);
    expect(screen.queryByTestId("today-voice")).not.toBeInTheDocument();
  });
});

describe("TodayCalm", () => {
  it("karar yokken sakin blok: uydurma iş ve düğme yok, sarı yok, Maskot bekliyor", () => {
    const { container } = render(<TodayCalm text={NO_ASKS_TEXT} maskotName="Demirkazık" />);
    const calm = screen.getByTestId("today-clear");
    expect(calm).toHaveTextContent("Bugünlük bu kadar");
    expect(calm).toHaveTextContent(NO_ASKS_TEXT);
    expect(calm).toHaveTextContent("Demirkazık bekliyor");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain("attention");
  });
});
