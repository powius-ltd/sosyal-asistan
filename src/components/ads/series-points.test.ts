import { describe, expect, it } from "vitest";

import { seriesPointsOf } from "@/components/ads/series-points";

describe("seriesPointsOf", () => {
  it("tarih sırasına dizer; sonuçsuz günde maliyet yok (0 değil)", () => {
    const points = seriesPointsOf([
      { adId: "a", date: "2026-09-02", spend: 30, impressions: 10, results: 3 },
      { adId: "a", date: "2026-09-01", spend: 20, impressions: 10, results: 0 },
      { adId: "a", date: "2026-09-03", spend: 10, impressions: 10 },
    ]);
    expect(points.map((p) => p.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(points[0]).not.toHaveProperty("costPerResult");
    expect(points[1]?.costPerResult).toBe(10);
    expect(points[2]).not.toHaveProperty("costPerResult");
  });
});
