import { describe, expect, it } from "vitest";

import { postsChange, viewsChange } from "@/lib/overview/period-change";
import { makeOverview } from "@/lib/overview/test-fixtures";

describe("viewsChange", () => {
  it("önceki dönemde ≥ 3 yayın varsa oranı verir", () => {
    expect(viewsChange(makeOverview({ posts: 9, postsPrev: 3, views: 150, viewsPrev: 100 }))).toBeCloseTo(0.5);
  });

  it("önceki dönemde 3'ten az yayın, 0 ya da bilinmeyen izlenme → undefined (uydurma oran yok)", () => {
    expect(viewsChange(makeOverview({ posts: 9, postsPrev: 2, views: 150, viewsPrev: 100 }))).toBeUndefined();
    expect(viewsChange(makeOverview({ posts: 9, postsPrev: 5, views: 150, viewsPrev: 0 }))).toBeUndefined();
    expect(viewsChange(makeOverview({ posts: 9, postsPrev: 5, views: 150, viewsPrev: undefined }))).toBeUndefined();
    expect(viewsChange(makeOverview({ posts: 9, postsPrev: undefined, views: 150, viewsPrev: 100 }))).toBeUndefined();
    expect(viewsChange(makeOverview({ posts: 9, postsPrev: 5, views: undefined, viewsPrev: 100 }))).toBeUndefined();
    expect(viewsChange(undefined)).toBeUndefined();
  });
});

describe("postsChange", () => {
  it("aynı eşik: önceki dönemde ≥ 3 yayın", () => {
    expect(postsChange(makeOverview({ posts: 6, postsPrev: 3 }))).toBe(1);
    expect(postsChange(makeOverview({ posts: 6, postsPrev: 2 }))).toBeUndefined();
  });
});
