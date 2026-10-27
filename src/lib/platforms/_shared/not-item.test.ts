import { describe, expect, it } from "vitest";
import { METRIC_FIELDS, missingMetricFields } from "@/lib/platforms/_shared/metric-fields";
import { notItemReason } from "@/lib/platforms/_shared/not-item";
import { parseRows } from "@/lib/platforms/_shared/parse-rows";

describe("notItemReason", () => {
  it("hata satırı: kod + açıklama + kullanıcı adı", () => {
    expect(notItemReason({ error: "not_found", errorDescription: "Post does not exist", username: "x" })).toBe(
      "not_found — Post does not exist (@x)",
    );
    expect(notItemReason({ error: "no_items" })).toBe("no_items");
  });

  it("boş zarf (results: [] ya da totalCount: 0) öğe değildir", () => {
    expect(notItemReason({ results: [], pageInfo: {} })).toMatch(/boş zarf/);
    expect(notItemReason({ totalCount: 0 })).toMatch(/boş zarf/);
  });

  it("nesne olmayan satır öğe değildir; gerçek öğe undefined döner", () => {
    expect(notItemReason(null)).toMatch(/nesne değil/);
    expect(notItemReason("x")).toMatch(/nesne değil/);
    expect(notItemReason({ id: "1", results: [{ a: 1 }] })).toBeUndefined();
    expect(notItemReason({ id: "1", totalCount: 5 })).toBeUndefined();
  });
});

describe("parseRows", () => {
  it("accessError yalnız sonuç tümüyle boşsa bildirilir", () => {
    const normalize = (row: Record<string, unknown>) =>
      typeof row.id === "string" ? ({ ok: true, value: row.id } as const) : ({ ok: false, reason: "kimlik yok" } as const);
    const access = () => "private";

    const empty = parseRows([{ error: "restricted_page" }], normalize, access);
    expect(empty).toEqual({ items: [], notItems: [{ reason: "restricted_page" }], accessError: "private" });

    const partial = parseRows([{ id: "a" }, { error: "restricted_page", username: "u" }, { foo: 1 }], normalize, access);
    expect(partial.items).toEqual(["a"]);
    expect(partial.notItems).toEqual([{ reason: "restricted_page (@u)" }, { reason: "kimlik yok" }]);
    expect("accessError" in partial).toBe(false);
  });
});

describe("missingMetricFields", () => {
  it("yazılmamış metrikleri listeler; ortalama izlenme süresi yalnız videoda", () => {
    expect(missingMetricFields({ views: 0, likes: 0, comments: 0, extra: {} }, "short_video")).toEqual(["shares", "saves", "reach", "avgWatchSec"]);
    expect(missingMetricFields({ likes: 3, extra: {} }, "carousel")).toEqual(["views", "comments", "shares", "saves", "reach"]);
    expect(METRIC_FIELDS).toContain("avgWatchSec");
  });
});
