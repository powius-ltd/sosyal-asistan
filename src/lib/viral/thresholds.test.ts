import { describe, expect, it } from "vitest";

import { ageDays, isViral, passesPrefilter, viralRatio } from "@/lib/viral/thresholds";

const NOW = new Date("2026-11-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("viralRatio", () => {
  it("takipçi yok ya da 0 ise undefined (0 değil)", () => {
    expect(viralRatio(50_000, undefined)).toBeUndefined();
    expect(viralRatio(50_000, 0)).toBeUndefined();
    expect(viralRatio(50_000, -3)).toBeUndefined();
  });
  it("izlenme / takipçi", () => {
    expect(viralRatio(30_000, 10_000)).toBe(3);
  });
});

describe("ageDays / passesPrefilter", () => {
  it("tarih çözülemezse undefined ve ön süzgeçten geçmez", () => {
    expect(ageDays("bozuk", NOW)).toBeUndefined();
    expect(passesPrefilter({ views: 99_999, publishedAt: "bozuk" }, NOW)).toBe(false);
  });
  it("30 gün sınırı dahil, 31 gün dışarıda", () => {
    expect(passesPrefilter({ views: 20_000, publishedAt: daysAgo(30) }, NOW)).toBe(true);
    expect(passesPrefilter({ views: 20_000, publishedAt: daysAgo(31) }, NOW)).toBe(false);
  });
  it("izlenme 10.000 altı geçmez", () => {
    expect(passesPrefilter({ views: 9_999, publishedAt: daysAgo(1) }, NOW)).toBe(false);
    expect(passesPrefilter({ views: 10_000, publishedAt: daysAgo(1) }, NOW)).toBe(true);
  });
  it("gelecekteki bozuk tarih geçmez", () => {
    expect(passesPrefilter({ views: 20_000, publishedAt: daysAgo(-5) }, NOW)).toBe(false);
  });
});

describe("isViral", () => {
  it("üç eşik birlikte: oran 3 ve üstü", () => {
    expect(isViral({ views: 30_000, authorFollowers: 10_000, publishedAt: daysAgo(2) }, NOW)).toBe(true);
    expect(isViral({ views: 29_999, authorFollowers: 10_000, publishedAt: daysAgo(2) }, NOW)).toBe(false);
  });
  it("takipçi bilinmiyorsa geçmez", () => {
    expect(isViral({ views: 900_000, publishedAt: daysAgo(2) }, NOW)).toBe(false);
  });
  it("oran yüksek ama izlenme küçükse geçmez", () => {
    expect(isViral({ views: 5_000, authorFollowers: 100, publishedAt: daysAgo(2) }, NOW)).toBe(false);
  });
});
