// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentCards } from "@/components/content/content-cards";
import { testItem } from "@/components/content/test-item";

const item = testItem({
  id: "ci_a",
  caption: "Evde V60 demlerken yapılan 3 hata ☕",
  publishedAt: "2026-09-20T09:00:00.000Z",
  url: "https://www.instagram.com/reel/abc/",
  metrics: { views: 12000, likes: 800, comments: 40, extra: {} },
  score: { lift: 3.4, liftTier: 3, baselineViews: 3500, baselineN: 17, lowConfidence: false, immature: false },
});

describe("ContentCards (dar ekranda içerik satırı, D2-05)", () => {
  it("kart: başlık, izlenme ve 'normalinin kaç katı' birlikte; başlık bağlantısı kartı kaplar", () => {
    render(<ContentCards items={[item]} timeZone="Europe/Istanbul" />);
    const card = screen.getByRole("listitem");
    expect(within(card).getByRole("link", { name: /Evde V60/ })).toHaveAttribute("href", "/video/ci_a");
    expect(within(card).getByRole("link", { name: /Evde V60/ }).className).toContain("after:absolute");
    expect(within(card).getByText("12.000")).toBeInTheDocument();
    expect(within(card).getByText("izlenme")).toBeInTheDocument();
    expect(within(card).getByText("normalinin 3,4 katı izlendi")).toBeInTheDocument();
    expect(within(card).getByText("800 beğeni · 40 yorum")).toBeInTheDocument(); // ölçülemeyen kaydetme atlanır, 0 uydurulmaz
    expect(card.textContent).not.toMatch(/lift|baz çizgisi|medyan/i);
  });

  it("platform bağlantısı ayrı ve 48 px hedef; ölçülemeyen izlenme tire + sebep, oran cümlesi yok", () => {
    const unmeasured = testItem({ id: "ci_b", missingFields: ["views"], metrics: { extra: {} }, score: { lowConfidence: false, immature: false } });
    render(<ContentCards items={[item, unmeasured]} />);
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first).getByRole("link", { name: "Platformda aç" })).toHaveClass("min-h-tap", "min-w-tap");
    expect(within(second).queryByText(/katı/)).not.toBeInTheDocument();
    expect(within(second).getAllByText("—").length).toBeGreaterThan(0);
  });
});
