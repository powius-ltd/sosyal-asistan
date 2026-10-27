import { describe, expect, it } from "vitest";

import { mean, median, pearson, percentileRank, pyRound } from "@/lib/metrics/stats";

describe("mean / median", () => {
  it("boş dizi → undefined (0 değil)", () => {
    expect(mean([])).toBeUndefined();
    expect(median([])).toBeUndefined();
  });

  it("Python statistics ile aynı: tek n ortadaki, çift n ortadaki ikisinin ortalaması", () => {
    expect(median([55, 110, 220])).toBe(110);
    expect(median([3, 1, 2, 10])).toBe(2.5);
    expect(median([7])).toBe(7);
    expect(mean([110, 220, 55])).toBeCloseTo(128.3333333, 6);
  });

  it("girdiyi değiştirmez", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });

  it("telafili toplama: kayan nokta birikimi yok", () => {
    expect(mean([0.1, 0.2, 0.3])).toBeCloseTo(0.2, 15);
    expect(mean([1e16, 1, -1e16])).toBeCloseTo(1 / 3, 12);
  });
});

describe("percentileRank (Python outliers._percentile_rank)", () => {
  it("n ≤ 1 → 50", () => {
    expect(percentileRank([], 5)).toBe(50);
    expect(percentileRank([5], 5)).toBe(50);
  });

  it("kesin küçük sayısı / (n − 1) × 100, 1 hane", () => {
    const values = [2200, 11, 550, 5, 1100, 550, 0];
    expect(percentileRank(values, 2200)).toBe(100);
    expect(percentileRank(values, 1100)).toBe(83.3);
    expect(percentileRank(values, 550)).toBe(50);
    expect(percentileRank(values, 11)).toBe(33.3);
    expect(percentileRank(values, 5)).toBe(16.7);
    expect(percentileRank(values, 0)).toBe(0);
  });
});

describe("pearson", () => {
  it("n < 3 → undefined", () => {
    expect(pearson([1, 2], [3, 4])).toBeUndefined();
  });

  it("sabit seri → undefined (tanımsız, hata değil)", () => {
    expect(pearson([1, 1, 1, 1], [1, 2, 3, 4])).toBeUndefined();
    expect(pearson([1, 2, 3, 4], [5, 5, 5, 5])).toBeUndefined();
  });

  it("uzunluk uyuşmazlığı → undefined", () => {
    expect(pearson([1, 2, 3], [1, 2, 3, 4])).toBeUndefined();
  });

  it("pandas Series.corr ile aynı değer", () => {
    // Python: pd.Series([1,2,3,4,5]).corr(pd.Series([2,4,5,4,5])) = 0.7745966692414834
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])).toBeCloseTo(0.7745966692414834, 12);
    // Python: round(corr([14.2,31,22.5,58], [24000,6100,9800,3100]), 3) = -0.799
    expect(pyRound(pearson([14.2, 31, 22.5, 58], [24000, 6100, 9800, 3100]) ?? NaN, 3)).toBe(-0.799);
  });

  it("tam doğrusal ilişki [-1, 1] içinde kalır", () => {
    const r = pearson([1, 2, 3, 4, 5], [11, 21, 31, 41, 51]) ?? NaN;
    expect(r).toBeCloseTo(1, 12);
    expect(r).toBeLessThanOrEqual(1);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBe(-1);
  });
});

describe("pyRound (Python round paritesi)", () => {
  it("Python 3.12 çıktılarıyla birebir", () => {
    const cases: [number, number, number][] = [
      [2.675, 2, 2.67],
      [0.125, 2, 0.12],
      [0.375, 2, 0.38],
      [2.5, 0, 2],
      [3.5, 0, 4],
      [-2.675, 2, -2.67],
      [1.005, 2, 1.0],
      [33.33333, 1, 33.3],
      [0.45, 1, 0.5],
      [12.3456789, 4, 12.3457],
      [100 / 3, 4, 33.3333],
      [0.5, 0, 0],
      [1.5, 0, 2],
      [66.65, 1, 66.7],
      [7.25, 1, 7.2],
    ];
    for (const [x, d, want] of cases) expect(pyRound(x, d), `round(${x}, ${d})`).toBe(want);
  });

  it("sonlu olmayan değer olduğu gibi döner", () => {
    expect(pyRound(Number.NaN, 2)).toBeNaN();
    expect(pyRound(Number.POSITIVE_INFINITY, 2)).toBe(Number.POSITIVE_INFINITY);
  });
});
