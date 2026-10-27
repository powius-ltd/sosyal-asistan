import { describe, expect, it } from "vitest";

import type { BaselineResult, ItemScore } from "@/lib/metrics/types";
import { contentRow, NOW } from "@/lib/scoring/test-fixtures";
import {
  pickIdentity,
  toBaselineBasisJson,
  toBaselineExcludedJson,
  toScoreColumns,
} from "@/lib/scoring/to-score-row";

const EXCLUDED = { self: 1, otherFormat: 2, pinned: 3, noViews: 4, otherKind: 5, noDate: 6, young: 7 };

function baseline(extra: Partial<BaselineResult> = {}): BaselineResult {
  return {
    median: 1500,
    n: 11,
    lowConfidence: false,
    basis: [{ id: "b1", views: 1500, publishedAt: new Date("2026-09-26T12:00:00Z") }],
    excluded: EXCLUDED,
    ...extra,
  };
}

describe("toBaselineExcludedJson", () => {
  it("metrik adlarını DB/domain adlarına çevirir (DB check'in beklediği 7 anahtar)", () => {
    const json = toBaselineExcludedJson(EXCLUDED);
    expect(json).toEqual({
      self: 1,
      otherFormat: 2,
      pinned: 3,
      noViews: 4,
      differentViewsKind: 5,
      noDate: 6,
      tooYoung: 7,
    });
    expect(Object.keys(json).sort()).toEqual(
      ["self", "otherFormat", "pinned", "noViews", "differentViewsKind", "noDate", "tooYoung"].sort(),
    );
  });
});

describe("toBaselineBasisJson", () => {
  it("baz çizgisi öğeleri: contentItemId + views + ISO publishedAt, sıra korunur", () => {
    const json = toBaselineBasisJson([
      { id: "b2", views: 10, publishedAt: new Date("2026-09-27T00:00:00Z") },
      { id: "b1", views: 0, publishedAt: new Date("2026-09-20T00:00:00Z") },
    ]);
    expect(json).toEqual([
      { contentItemId: "b2", views: 10, publishedAt: "2026-09-27T00:00:00.000Z" },
      { contentItemId: "b1", views: 0, publishedAt: "2026-09-20T00:00:00.000Z" },
    ]);
  });
});

describe("toScoreColumns", () => {
  it("tam skor → sütunlar", () => {
    const score: ItemScore = {
      viewsKind: "ig_play_count",
      baselineViews: 1500,
      baselineN: 11,
      lift: 6,
      liftTier: 4,
      lowConfidence: false,
      immature: false,
      crossScore: -0.97,
    };
    expect(toScoreColumns(score, baseline(), NOW)).toEqual({
      views_kind: "ig_play_count",
      baseline_views: 1500,
      baseline_n: 11,
      baseline_excluded: toBaselineExcludedJson(EXCLUDED),
      baseline_basis: [{ contentItemId: "b1", views: 1500, publishedAt: "2026-09-26T12:00:00.000Z" }],
      lift: 6,
      lift_tier: 4,
      low_confidence: false,
      immature: false,
      cross_score: -0.97,
      scored_at: "2026-09-30T12:00:00.000Z",
    });
  });

  it("hesaplanamayan NULL yazılır (0 değil); 0 lift/kademe ölçülmüş değerdir", () => {
    const unmeasured: ItemScore = { baselineN: 0, lowConfidence: true, immature: false };
    const columns = toScoreColumns(unmeasured, baseline({ median: undefined, n: 0, basis: [] }), NOW);
    expect(columns).toMatchObject({
      views_kind: null,
      baseline_views: null,
      baseline_n: 0,
      baseline_basis: [],
      lift: null,
      lift_tier: null,
      low_confidence: true,
      cross_score: null,
    });

    const zero = toScoreColumns({ ...unmeasured, baselineViews: 10, baselineN: 12, lift: 0, liftTier: 0 }, baseline(), NOW);
    expect(zero.lift).toBe(0);
    expect(zero.lift_tier).toBe(0);
  });

  it("sonlu olmayan sayı NULL olur (DB kısıtı Infinity/NaN kabul etmez)", () => {
    const columns = toScoreColumns(
      { lift: Number.POSITIVE_INFINITY, crossScore: Number.NaN, lowConfidence: false, immature: false },
      baseline(),
      NOW,
    );
    expect(columns.lift).toBeNull();
    expect(columns.cross_score).toBeNull();
  });
});

describe("pickIdentity", () => {
  it("yalnız kimlik sütunlarını (değiştirmeden) alır", () => {
    const row = contentRow("a", 5, { is_pinned: true });
    expect(pickIdentity(row)).toEqual({
      id: "a",
      workspace_id: row.workspace_id,
      platform: "instagram",
      external_id: "ext-a",
      format: "short_video",
      social_account_id: null,
      competitor_id: row.competitor_id,
    });
  });
});
