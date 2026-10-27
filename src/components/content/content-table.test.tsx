// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentTable } from "@/components/content/content-table";
import { testItem } from "@/components/content/test-item";

const measuredItem = testItem({
  id: "ci_a",
  caption: "Evde V60 demlerken yapılan 3 hata ☕",
  publishedAt: "2026-09-20T09:00:00.000Z",
  metrics: { views: 12000, likes: 800, comments: 40, saves: 0, extra: {} },
  score: { lift: 3.4, liftTier: 3, baselineViews: 3500, baselineN: 17, lowConfidence: false, immature: false },
});

describe("ContentTable", () => {
  it("her satırdan /video/[id] bağlantısı verir", () => {
    render(<ContentTable items={[measuredItem]} timeZone="Europe/Istanbul" />);
    const link = screen.getByRole("link", { name: /Evde V60/ });
    expect(link).toHaveAttribute("href", "/video/ci_a");
  });

  it("0 gerçek ölçümdür: kaydetme 0 → \"0\", tire değil", () => {
    render(<ContentTable items={[measuredItem]} />);
    const row = screen.getAllByRole("row")[1];
    expect(screen.getByRole("columnheader", { name: "Kaydetme" })).toBeInTheDocument();
    expect(within(row).getByText("0")).toHaveAttribute("data-state", "measured");
  });

  it("ölçülemeyen hücre tire + sebep gösterir, lift rozeti düşük güveni işaretler", () => {
    const unmeasured = testItem({
      id: "ci_b",
      format: "carousel",
      missingFields: ["views"],
      metrics: { likes: 10, comments: 1, saves: 2, extra: {} },
      score: { lowConfidence: true, immature: false },
    });
    render(<ContentTable items={[measuredItem, unmeasured]} />);
    const row = screen.getAllByRole("row")[2];
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
    expect(
      within(row).getByLabelText("Ölçülemedi: Platform bu içerik için izlenme sayısını vermedi."),
    ).toBeInTheDocument();
  });

  it("sayfadaki hiçbir içerikte ölçülemeyen sütunu gizler ve dipnotta belirtir", () => {
    const noSaves = { ...measuredItem, metrics: { views: 5, likes: 1, comments: 0, extra: {} } };
    render(<ContentTable items={[noSaves]} />);
    expect(screen.queryByRole("columnheader", { name: "Kaydetme" })).not.toBeInTheDocument();
    expect(screen.getByText(/gizlenen sütunlar: Kaydetme/)).toBeInTheDocument();
  });

  it("alt yazı yoksa kısa kodu başlık yapar ve uzun alt yazıyı keser", () => {
    const long = testItem({ id: "ci_c", caption: "x".repeat(200), metrics: { views: 1, likes: 1, comments: 1, saves: 1, extra: {} } });
    const noCaption = testItem({ id: "ci_d", shortcode: "C_kod", metrics: long.metrics });
    render(<ContentTable items={[long, noCaption]} />);
    expect(screen.getByText("İçerik C_kod")).toBeInTheDocument();
    expect(screen.getByText(/^x+…$/).textContent).toHaveLength(70);
  });
});
