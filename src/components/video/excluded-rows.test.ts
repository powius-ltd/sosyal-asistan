import { describe, expect, it } from "vitest";

import { excludedRows } from "@/components/video/excluded-rows";
import type { BaselineExcludedCounts } from "@/lib/domain/content";

const ZERO: BaselineExcludedCounts = { self: 0, otherFormat: 0, pinned: 0, noViews: 0, differentViewsKind: 0, noDate: 0, tooYoung: 0 };

describe("excludedRows", () => {
  it("yalnız sıfırdan büyük sayaçları, kural sırasıyla listeler", () => {
    const rows = excludedRows({ ...ZERO, tooYoung: 2, self: 1, noDate: 4, otherFormat: 9 });
    expect(rows.map((r) => [r.key, r.count])).toEqual([
      ["self", 1],
      ["otherFormat", 9],
      ["noDate", 4],
      ["tooYoung", 2],
    ]);
    expect(rows.every((r) => r.label.length > 0)).toBe(true);
  });

  it("hiçbir şey dışarıda kalmadıysa boş liste", () => {
    expect(excludedRows(ZERO)).toEqual([]);
  });

  it("yedi sayacın hepsi bir etiket alır", () => {
    const all = Object.fromEntries(Object.keys(ZERO).map((k) => [k, 1])) as unknown as BaselineExcludedCounts;
    expect(excludedRows(all)).toHaveLength(7);
  });
});
