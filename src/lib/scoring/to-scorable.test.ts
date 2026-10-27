import { describe, expect, it } from "vitest";

import { contentRow, metricsRow, NOW } from "@/lib/scoring/test-fixtures";
import { parseTimestamp, toScorableItem } from "@/lib/scoring/to-scorable";

describe("parseTimestamp", () => {
  it("ISO zaman damgası → Date; NULL/geçersiz → undefined", () => {
    expect(parseTimestamp("2026-09-30T12:00:00+00:00")?.toISOString()).toBe("2026-09-30T12:00:00.000Z");
    expect(parseTimestamp(null)).toBeUndefined();
    expect(parseTimestamp(undefined)).toBeUndefined();
    expect(parseTimestamp("dün")).toBeUndefined();
  });
});

describe("toScorableItem", () => {
  it("içerik + son ölçüm → skorlanabilir öğe", () => {
    const item = toScorableItem(contentRow("a", 5, { is_pinned: true }), metricsRow("a", 1200));
    expect(item).toEqual({
      id: "a",
      format: "short_video",
      publishedAt: new Date(NOW.getTime() - 5 * 86_400_000),
      isPinned: true,
      views: 1200,
      viewsKind: "ig_play_count",
    });
  });

  it("ölçülemeyen undefined olur (0 değil); 0 views ölçülmüş sıfırdır", () => {
    const noMetrics = toScorableItem(contentRow("a", undefined), undefined);
    expect(noMetrics).toEqual({ id: "a", format: "short_video" });
    expect("views" in noMetrics).toBe(false);
    expect("publishedAt" in noMetrics).toBe(false);

    const nullViews = toScorableItem(contentRow("b", 5), metricsRow("b", null, null));
    expect(nullViews.views).toBeUndefined();
    expect(nullViews.viewsKind).toBeUndefined();

    expect(toScorableItem(contentRow("c", 5), metricsRow("c", 0)).views).toBe(0);
  });

  it("yalnız is_pinned = true taşınır (false ve NULL baz çizgisine girer)", () => {
    expect(toScorableItem(contentRow("a", 5, { is_pinned: false }), undefined).isPinned).toBeUndefined();
    expect(toScorableItem(contentRow("b", 5, { is_pinned: null }), undefined).isPinned).toBeUndefined();
  });

  it("geçersiz yayın tarihi undefined olur", () => {
    expect(toScorableItem(contentRow("a", 5, { published_at: "geçersiz" }), undefined).publishedAt).toBeUndefined();
  });
});
