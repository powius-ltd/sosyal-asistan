import { describe, expect, it } from "vitest";

import { scoreAccount } from "@/lib/metrics";
import { scoreOwnerContent } from "@/lib/scoring/score-owner";
import { contentRow, metricsRow, NOW } from "@/lib/scoring/test-fixtures";
import { toScorableItem } from "@/lib/scoring/to-scorable";
import type { ContentScoringRow, LatestMetricsRow } from "@/lib/scoring/types";

// 11 olgun kısa video (4..14 gün, 1000..2000 views) + tutan (3,5 gün, 9000) + her dışlama kuralından bir içerik.
const NORMAL = Array.from({ length: 11 }, (_, i) => contentRow(`n${String(i + 1).padStart(2, "0")}`, i + 4));
const ROWS: ContentScoringRow[] = [
  ...NORMAL,
  contentRow("hit", 3.5),
  contentRow("pinned", 20, { is_pinned: true }),
  contentRow("young", 1),
  contentRow("unmeasured", 5.5),
  contentRow("carousel", 6.5, { format: "carousel" }),
  contentRow("otherkind", 7.5),
  contentRow("nodate", undefined),
];
const METRICS: LatestMetricsRow[] = [
  ...NORMAL.map((row, i) => metricsRow(row.id, 1000 + i * 100)),
  metricsRow("hit", 9000),
  metricsRow("pinned", 50_000),
  metricsRow("young", 800),
  metricsRow("carousel", null, null),
  metricsRow("otherkind", 5000, "ig_view_count"),
  metricsRow("nodate", 1200),
];
const byId = (rows: LatestMetricsRow[]) => new Map(rows.map((row) => [row.content_item_id as string, row]));

function score(rows = ROWS, followers: number | null = 10_000) {
  const out = scoreOwnerContent({ rows, metrics: byId(METRICS), followers: followers ?? undefined, now: NOW });
  return new Map(out.map((row) => [row.id, row]));
}

describe("scoreOwnerContent", () => {
  it("tutan: lift 6x (kademe 4), 11 içerikli baz çizgisi, her dışlama kuralı sayılır", () => {
    const hit = score().get("hit");
    expect(hit).toMatchObject({
      views_kind: "ig_play_count",
      baseline_views: 1500,
      baseline_n: 11,
      lift: 6,
      lift_tier: 4,
      low_confidence: false,
      immature: false,
      scored_at: NOW.toISOString(),
      baseline_excluded: {
        self: 1,
        otherFormat: 1,
        pinned: 1,
        noViews: 1,
        differentViewsKind: 1,
        noDate: 1,
        tooYoung: 1,
      },
    });
    expect(hit?.cross_score).toBeCloseTo(Math.log(9000 / 10_000) * Math.log(10_000), 12);
    // Baz çizgisi yeniden eskiye: ilk öğe en yeni olgun içerik (4 gün).
    expect(hit?.baseline_basis.map((b) => b.contentItemId)).toEqual(NORMAL.map((row) => row.id));
  });

  it("ölçülemeyen NULL: views yoksa lift/kademe NULL, baz çizgisi boşsa medyan NULL + düşük güven", () => {
    const rows = score();
    expect(rows.get("unmeasured")).toMatchObject({
      views_kind: null,
      baseline_views: null,
      baseline_n: 0,
      lift: null,
      lift_tier: null,
      low_confidence: true,
      cross_score: null,
    });
    expect(rows.get("carousel")).toMatchObject({ lift: null, lift_tier: null, cross_score: null });
    // Farklı viewsKind hiçbir içerikle karşılaştırılmaz; crossScore baz çizgisinden bağımsızdır.
    const other = rows.get("otherkind");
    expect(other).toMatchObject({ views_kind: "ig_view_count", baseline_n: 0, lift: null, low_confidence: true });
    expect(other?.cross_score).toBeCloseTo(Math.log(0.5) * Math.log(10_000), 12);
  });

  it("genç içerik olgunlaşmamış işaretlenir; tarihsiz içerik genç sayılmaz", () => {
    const rows = score();
    expect(rows.get("young")).toMatchObject({ immature: true, baseline_n: 12, baseline_views: 1550 });
    expect(rows.get("nodate")).toMatchObject({ immature: false, baseline_n: 12, baseline_views: 1550 });
  });

  it("takipçi bilinmiyorsa cross_score NULL (0 değil)", () => {
    for (const row of score(ROWS, null).values()) expect(row.cross_score).toBeNull();
  });

  it("skor sütunları scoreAccount ile birebir; açıklamanın medyan/n'i skorla tutarlı", () => {
    const scorable = ROWS.map((row) => toScorableItem(row, byId(METRICS).get(row.id)));
    const expected = scoreAccount(scorable, 10_000, NOW);
    for (const [id, row] of score()) {
      const s = expected.get(id);
      expect(row.lift).toBe(s?.lift ?? null);
      expect(row.lift_tier).toBe(s?.liftTier ?? null);
      expect(row.baseline_views).toBe(s?.baselineViews ?? null);
      expect(row.baseline_n).toBe(s?.baselineN ?? null);
      expect(row.low_confidence).toBe(s?.lowConfidence);
      expect(row.immature).toBe(s?.immature);
      expect(row.baseline_basis).toHaveLength(row.baseline_n ?? 0);
    }
  });

  it("kimlik sütunları değişmeden taşınır", () => {
    const row = score().get("carousel");
    expect(row).toMatchObject({ format: "carousel", external_id: "ext-carousel", social_account_id: null });
  });

  it("idempotent ve girdi sırasından bağımsız: aynı veri → aynı satırlar", () => {
    const first = score();
    expect(score()).toEqual(first);
    expect(score([...ROWS].reverse())).toEqual(first);
  });

  it("boş girdi → boş çıktı", () => {
    expect(scoreOwnerContent({ rows: [], metrics: new Map(), followers: 10, now: NOW })).toEqual([]);
  });
});
