// @vitest-environment jsdom
/** Bugün'de dokunma hedefleri (D1-11): dar ekranda ≥ 48 px (`min-h-tap`), `md`+ 44 px. jsdom ölçü almaz, sınıf sabitlenir. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/publish", () => ({ approvePublishJob: vi.fn() }));
vi.mock("@/app/actions/idea-links", () => ({ resolveIdeaLinkAction: vi.fn(), linkIdeaToReelAction: vi.fn() }));
vi.mock("@/app/actions/jobs", () => ({ requestJobAction: vi.fn() }));

import { FocusBlock } from "@/components/today/focus-block";
import { LaterList } from "@/components/today/later-list";
import { TodayVoice } from "@/components/today/today-voice";
import { TAP_CHIPS, TAP_WHY } from "@/components/today/tap";
import type { DecisionCard } from "@/lib/today";

const CARD: DecisionCard = {
  id: "confirm_link:l1",
  kind: "confirm_link",
  title: "Bu video bu fikirden mi çıktı?",
  body: "Yayınladığın bir videonun hangi fikirden çıktığını tahmin ettim.",
  primary: { kind: "action", action: "resolveIdeaLinkAction", label: "Evet, bu fikir", payload: { linkId: "l1", decision: "confirm" } },
  secondary: { kind: "link", label: "Fikri aç", href: "/fikirler" },
  evidence: ["idea:idea_1"],
  operatorOnly: false,
};

describe("Bugün: dokunma hedefleri", () => {
  it("baskın karar: 'Neden?' satırı ve kanıt çipleri büyütülür; ikincil bağlantı düğmesi 48 px", () => {
    const { container } = render(<FocusBlock card={CARD} position={1} total={1} stepLabel="Karar" timeZone="Europe/Istanbul" />);
    expect(screen.getByText("Neden?").closest("details")).toHaveClass(...TAP_WHY.split(" "));
    expect(container.querySelector("ul[aria-label=Kanıt]")?.parentElement).toHaveClass(...TAP_CHIPS.split(" "));
    expect(screen.getByRole("link", { name: "Fikri aç" })).toHaveClass("min-h-tap", "md:min-h-0");
  });

  it("'Sonra' satırı: düğmeler ve 'Neden?' dar ekranda 48 px", () => {
    const { container } = render(<LaterList cards={[CARD]} timeZone="Europe/Istanbul" />);
    expect(container.querySelector("details details")).toHaveClass(...TAP_WHY.split(" "));
    expect(screen.getByRole("link", { name: "Fikri aç" })).toHaveClass("min-h-tap");
    expect(screen.getByRole("button", { name: "Evet, bu fikir" })).toHaveClass("min-h-tap");
  });

  it("söz: 'Planı aç' bağlantısı ve notun 'Neden?' satırı 48 px", () => {
    render(
      <TodayVoice
        voice={{
          lead: "Bu hafta 6 video inceledim.",
          link: { label: "Planı aç", href: "/bu-hafta" },
          note: { headline: "Soruyla açılan videolar tuttu", text: "İlk cümle. İkinci cümle.", confidence: "medium", evidence: ["c:ci-1"], generatedAt: "2026-10-05T08:00:00.000Z" },
        }}
        state={{ kind: "clear", text: "" }}
        maskotName="Demirkazık"
        mascot="waiting"
        now={new Date("2026-10-05T09:00:00.000Z")}
      />,
    );
    expect(screen.getByRole("link", { name: /Planı aç/ })).toHaveClass("min-h-tap");
    expect(screen.getByText("Neden?").closest("details")).toHaveClass(...TAP_WHY.split(" "));
  });
});
