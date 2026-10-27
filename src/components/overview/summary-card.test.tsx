// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SummaryCard } from "@/components/overview/summary-card";
import { NO_ASKS_TEXT } from "@/lib/overview/summary";
import type { OverviewSummary, SummaryAsk } from "@/lib/overview/types";

const ask = (id: SummaryAsk["id"], text: string, label = "Aç"): SummaryAsk => ({ id, text, action: { label, href: `/${id}` } });

function summary(patch: Partial<OverviewSummary> = {}): OverviewSummary {
  return {
    empty: false,
    where: { text: "Son 30 günde 20 video paylaştın.", link: { label: "Hangileri?", href: "/tutanlar" } },
    done: { text: "Bu hafta 6 video inceledim.", link: { label: "Planı aç", href: "/bu-hafta?hafta=2026-10-05" } },
    asks: [ask("approve_publish", "2 yayın senin onayını bekliyor.", "Yayınları aç"), ask("shoot_next", "Sıradaki video: “X”."), ask("measurement", "1 videonun 7. gün sonucu bekleniyor.")],
    ...patch,
  };
}

describe("SummaryCard", () => {
  it("üç satırı etiketiyle çizer; maskot adı başlıkta, 'Neden?' bağlantıları satır başlığında", () => {
    render(<SummaryCard summary={summary()} maskotName="Pusula" />);
    const card = screen.getByTestId("overview-summary");
    expect(within(card).getByText("Özet")).toBeInTheDocument();
    expect(within(card).getByText(/Pusula/)).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "Neredeyiz" })).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "Bu hafta ne yaptık" })).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "Senden beklediğim" })).toBeInTheDocument();
    expect(within(card).getByText("Son 30 günde 20 video paylaştın.")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Hangileri?" })).toHaveAttribute("href", "/tutanlar");
    expect(within(card).getByRole("link", { name: "Planı aç" })).toHaveAttribute("href", "/bu-hafta?hafta=2026-10-05");
  });

  it("ilk iş birincil düğmedir (≥ 44 px); kalanı '+N iş daha' altında kapalı durur", () => {
    render(<SummaryCard summary={summary()} maskotName="Pusula" />);
    const first = screen.getByRole("link", { name: "Yayınları aç" });
    expect(first).toHaveAttribute("href", "/approve_publish");
    expect(first.className).toContain("h-11");
    expect(first.className).toContain("bg-primary");
    const more = screen.getByText("+2 iş daha");
    const details = more.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText("Sıradaki video: “X”.")).toBeInTheDocument();
    expect(within(details).getByText("1 videonun 7. gün sonucu bekleniyor.")).toBeInTheDocument();
    // Diğer işlerin düğmesi birincil değil.
    expect(within(details).getAllByRole("link")[0].className).not.toContain("bg-primary");
  });

  it("tek iş varsa '+N iş daha' çizilmez", () => {
    render(<SummaryCard summary={summary({ asks: [ask("shoot_next", "Sıradaki video: “X”.")] })} maskotName="Pusula" />);
    expect(screen.queryByText(/iş daha/)).not.toBeInTheDocument();
  });

  it("iş yoksa 'şu an senden bir şey beklemiyorum' der, düğme çizmez", () => {
    render(<SummaryCard summary={summary({ asks: [] })} maskotName="Pusula" />);
    expect(screen.getByText(NO_ASKS_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Senden beklediğim işler" })).not.toBeInTheDocument();
  });

  it("boş çalışma alanında ikinci satır yok; yalnız ilk-bakış metni ve hesabı bağla düğmesi", () => {
    render(
      <SummaryCard
        summary={{
          empty: true,
          where: { text: "Henüz hesabına bakmadım; ilk bakıştan sonra nerede olduğunu burada yazacağım." },
          asks: [ask("connect_account", "Hesabını bağla.", "Ayarlar'ı aç")],
        }}
        maskotName="Pusula"
      />,
    );
    expect(screen.getByText(/Henüz hesabına bakmadım/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bu hafta ne yaptık" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ayarlar'ı aç" })).toHaveAttribute("href", "/connect_account");
  });

  it("okunamayan satır çizilmez (etiket tek başına kalmaz)", () => {
    render(<SummaryCard summary={summary({ where: undefined, done: undefined })} maskotName="Pusula" />);
    expect(screen.queryByRole("heading", { name: "Neredeyiz" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bu hafta ne yaptık" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Senden beklediğim" })).toBeInTheDocument();
  });

  it("müşteriye komut, Apify ve bütçe konuşmaz", () => {
    render(<SummaryCard summary={summary()} maskotName="Pusula" />);
    expect(screen.queryByText(/npm run|Apify|bütçe/)).not.toBeInTheDocument();
  });
});
