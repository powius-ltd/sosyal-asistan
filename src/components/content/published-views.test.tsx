// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { testItem } from "@/components/content/test-item";
import { toChartFilter } from "@/components/content/parse-content-query";
import {
  buildPublishedViewsData,
  pointFillClass,
  PUBLISHED_CHART_MAX_ITEMS,
  tierLegendLabel,
  TIER_DOT,
  TIER_FILL,
} from "@/components/content/published-views";
import { PublishedViewsCard } from "@/components/content/published-views-card";

const NOW = new Date("2026-09-30T12:00:00.000Z");

function video(id: string, publishedAt: string | undefined, views: number | undefined, lift?: number) {
  return testItem({
    id,
    publishedAt,
    caption: `Video ${id}`,
    metrics: { views, extra: {} },
    score: { lift, lowConfidence: false, immature: false },
  });
}

describe("buildPublishedViewsData", () => {
  it("yayın tarihine göre eskiden yeniye sıralar; lift'ten kademe türetir", () => {
    const { points, excluded } = buildPublishedViewsData([
      video("b", "2026-09-20T09:00:00.000Z", 5_000, 3.4),
      video("a", "2026-09-01T09:00:00.000Z", 900, 0.8),
    ]);
    expect(points.map((p) => p.contentItemId)).toEqual(["a", "b"]);
    expect(points.map((p) => p.tier)).toEqual([0, 3]);
    expect(excluded).toBe(0);
  });

  it("0 izlenme gerçek ölçümdür (noktası çizilir); izlenme ya da tarih yoksa 0'a çevrilmez, dışarıda bırakılıp sayılır", () => {
    const { points, excluded } = buildPublishedViewsData([
      video("zero", "2026-09-10T09:00:00.000Z", 0, 0),
      video("noViews", "2026-09-11T09:00:00.000Z", undefined),
      video("noDate", undefined, 1_200),
      video("badDate", "yarın", 1_200),
    ]);
    expect(points.map((p) => [p.contentItemId, p.views])).toEqual([["zero", 0]]);
    expect(excluded).toBe(3);
  });

  it("lift ölçülemeyen videonun kademesi undefined (kademe 0 değil)", () => {
    const { points } = buildPublishedViewsData([video("x", "2026-09-10T09:00:00.000Z", 700, undefined)]);
    expect(points[0].tier).toBeUndefined();
    expect(points[0].lift).toBeUndefined();
  });
});

describe("kademe renkleri", () => {
  it("LiftBadge ailesi: kademe 1-4 belirteçleri (tier-N-solid); ölçülemeyen ayrı (boş halka)", () => {
    for (const tier of [1, 2, 3, 4] as const) {
      expect(TIER_FILL[tier]).toBe(`fill-tier-${tier}-solid`);
      expect(TIER_DOT[tier]).toBe(`bg-tier-${tier}-solid`);
    }
    expect(pointFillClass(undefined)).toContain("transparent");
    expect(pointFillClass(3)).toBe(TIER_FILL[3]);
  });

  it("açıklama etiketleri lift eşiklerinden", () => {
    expect(tierLegendLabel(0)).toBe("normalinin 1,5 katından az");
    expect(tierLegendLabel(3)).toBe("normalinin 3 katı ve üstü");
    expect(tierLegendLabel(4)).toBe("normalinin 5 katı ve üstü");
  });
});

describe("toChartFilter", () => {
  it("listeyle aynı filtre ama sayfalamasız, en yeni üst sınıra kadar", () => {
    const filter = toChartFilter(
      { account: "oa_1", format: "short_video", days: 30, sort: "lift", cursor: "abc", history: ["x"] },
      NOW,
    );
    expect(filter).toMatchObject({ ownerKind: "own", ownerId: "oa_1", format: "short_video", sort: "recent", limit: PUBLISHED_CHART_MAX_ITEMS });
    expect(filter.cursor).toBeUndefined();
    expect(filter.since).toBe("2026-08-31T12:00:00.000Z");
  });
});

describe("PublishedViewsCard", () => {
  it("noktası olan içerikte grafik ve renk açıklaması; dışarıda kalan sayısı söylenir", () => {
    render(
      <PublishedViewsCard
        items={[video("a", "2026-09-01T09:00:00.000Z", 900, 1.6), video("b", "2026-09-20T09:00:00.000Z", 5_000, 3.4), video("c", undefined, 10)]}
        timeZone="Europe/Istanbul"
      />,
    );
    expect(screen.getByText("Yayın tarihine göre izlenme")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /2 video/ })).toBeInTheDocument();
    // Grafiğin metin karşılığı: en çok / en az izlenen (noktalar tek tek odaklanmaz).
    expect(screen.getByRole("img", { name: /En çok izlenen: “Video b”.*En az izlenen: “Video a”/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Renk açıklaması")).toHaveTextContent("normalinin 3 katı ve üstü");
    expect(screen.getByLabelText("Renk açıklaması")).not.toHaveTextContent(/lift/i);
    expect(screen.getByText(/1 içerik grafikte yok/)).toBeInTheDocument();
  });

  it("hiçbir içerik ölçülemediyse grafik yerine sebepli boş durum", () => {
    render(<PublishedViewsCard items={[video("c", undefined, undefined)]} />);
    expect(screen.getByText("Grafik çizilemiyor")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Yayın tarihine göre/ })).not.toBeInTheDocument();
  });
});
