import { describe, expect, it } from "vitest";

import { crossScore, similarSize } from "@/lib/metrics/cross-account";

describe("crossScore = ln(views / takipçi) × ln(takipçi)", () => {
  it("formül", () => {
    expect(crossScore(100_000, 10_000)).toBeCloseTo(Math.log(10) * Math.log(10_000), 12);
    // views = takipçi → ln(1) = 0: ölçülmüş sıfır
    expect(crossScore(5000, 5000)).toBe(0);
    // views < takipçi → negatif
    expect(crossScore(1000, 10_000)).toBeLessThan(0);
  });

  it("aynı oran, büyük hesap daha yüksek skor alır", () => {
    const small = crossScore(20_000, 2_000) ?? NaN;
    const big = crossScore(2_000_000, 200_000) ?? NaN;
    expect(big).toBeGreaterThan(small);
  });

  it("takipçi < 2, views ≤ 0 ya da bilinmeyen → undefined", () => {
    expect(crossScore(100, 1)).toBeUndefined();
    expect(crossScore(100, 0)).toBeUndefined();
    expect(crossScore(100, 1.99)).toBeUndefined();
    expect(crossScore(100, 2)).toBeCloseTo(Math.log(50) * Math.log(2), 12);
    expect(crossScore(0, 1000)).toBeUndefined();
    expect(crossScore(-1, 1000)).toBeUndefined();
    expect(crossScore(undefined, 1000)).toBeUndefined();
    expect(crossScore(100, undefined)).toBeUndefined();
    expect(crossScore(Number.NaN, 1000)).toBeUndefined();
  });
});

describe("similarSize (takipçi ±3x)", () => {
  it("sınır dahil", () => {
    expect(similarSize(1000, 3000)).toBe(true);
    expect(similarSize(3000, 1000)).toBe(true);
    expect(similarSize(1000, 3001)).toBe(false);
    expect(similarSize(1000, 333)).toBe(false);
    expect(similarSize(1000, 1000)).toBe(true);
  });

  it("özel oran", () => {
    expect(similarSize(1000, 1900, 2)).toBe(true);
    expect(similarSize(1000, 2100, 2)).toBe(false);
  });

  it("bilinmeyen / pozitif olmayan / geçersiz oran → undefined", () => {
    expect(similarSize(undefined, 1000)).toBeUndefined();
    expect(similarSize(1000, undefined)).toBeUndefined();
    expect(similarSize(0, 1000)).toBeUndefined();
    expect(similarSize(1000, 1000, 0.5)).toBeUndefined();
  });
});
