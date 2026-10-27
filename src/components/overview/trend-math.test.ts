import { describe, expect, it } from "vitest";

import { isMeasured } from "@/lib/domain/measured";
import type { TrendPoint } from "@/lib/domain/overview";
import {
  changeBetween,
  countMeasuredPoints,
  hasGaps,
  hasMeasuredPoints,
  trendChange,
  trendSummary,
  valuesDaysApart,
} from "@/components/overview/trend-math";

/** 2026-09-01'den başlayan günlük seri. */
function series(values: (number | undefined)[]): TrendPoint[] {
  return values.map((value, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, value }));
}

describe("valuesDaysApart", () => {
  it("son ölçüm ile N gün öncekini eşler", () => {
    const points = series([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
    expect(valuesDaysApart(points, 7)).toEqual({ latest: 109, base: 102 });
  });

  it("tam N gün önceki gün boşsa daha eski en yakın ölçümü kullanır", () => {
    const points = series([100, 101, undefined, 103, 104, 105, 106, 107, 108, 109]);
    // son gün = 10 → hedef gün 3 (boş) → gün 2'deki 101
    expect(valuesDaysApart(points, 7)).toEqual({ latest: 109, base: 101 });
  });

  it("seri yeterince geriye gitmiyorsa undefined döner (0 değil)", () => {
    expect(valuesDaysApart(series([100, 101, 102]), 7)).toBeUndefined();
  });

  it("boş seri ve tamamı ölçülemeyen seri undefined döner", () => {
    expect(valuesDaysApart([], 7)).toBeUndefined();
    expect(valuesDaysApart(series([undefined, undefined]), 1)).toBeUndefined();
  });

  it("son gün ölçülemediyse son ÖLÇÜLEN noktayı esas alır", () => {
    const points = series([100, 101, 102, 103, 104, 105, 106, 107, undefined]);
    expect(valuesDaysApart(points, 7)).toEqual({ latest: 107, base: 100 });
  });
});

describe("changeBetween", () => {
  it("artışı işaretli ve yüzdeyle biçimler", () => {
    const change = changeBetween(1100, 1000, "sebep");
    expect(change.direction).toBe(1);
    expect(change.text).toEqual({ status: "measured", value: "+100 (+%10)" });
  });

  it("düşüşü eksi işaretle biçimler", () => {
    const change = changeBetween(900, 1000, "sebep");
    expect(change.direction).toBe(-1);
    expect(isMeasured(change.text) && change.text.value.startsWith("-100")).toBe(true);
  });

  it("değişim yoksa gerçek ölçüm olarak 0 basar (tire değil)", () => {
    const change = changeBetween(1000, 1000, "sebep");
    expect(change.direction).toBe(0);
    expect(change.text).toEqual({ status: "measured", value: "0 (%0)" });
  });

  it("taban 0 ise yüzde eklenmez", () => {
    expect(changeBetween(10, 0, "sebep").text).toEqual({ status: "measured", value: "+10" });
  });

  it("değerlerden biri yoksa ölçülemedi + sebep döner", () => {
    expect(changeBetween(undefined, 5, "yok").text).toEqual({ status: "unmeasured", reason: "yok" });
    expect(changeBetween(5, undefined, "yok").direction).toBe(0);
  });
});

describe("trendChange", () => {
  it("yeterli geçmiş yoksa ölçülemedi sebebi taşır", () => {
    const change = trendChange(series([1, 2, 3]), 7);
    expect(change.text.status).toBe("unmeasured");
  });

  it("seri hiç yoksa ölçülemedi döner", () => {
    expect(trendChange(undefined, 7).text.status).toBe("unmeasured");
  });
});

describe("hasMeasuredPoints / hasGaps", () => {
  it("boşluk ve ölçüm durumlarını ayırır", () => {
    expect(hasMeasuredPoints(series([undefined, undefined]))).toBe(false);
    expect(hasMeasuredPoints(series([undefined, 0]))).toBe(true);
    expect(hasGaps(series([1, undefined, 3]))).toBe(true);
    expect(hasGaps(series([1, 2, 3]))).toBe(false);
    expect(hasGaps(series([undefined, undefined]))).toBe(false);
  });
});

describe("countMeasuredPoints", () => {
  it("yalnız ölçülmüş noktaları sayar; boşluk ve boş seri 0 nokta", () => {
    expect(countMeasuredPoints(series([1, undefined, 3]))).toBe(2);
    expect(countMeasuredPoints(series([5]))).toBe(1);
    expect(countMeasuredPoints(series([undefined]))).toBe(0);
    expect(countMeasuredPoints([])).toBe(0);
  });
});

describe("trendSummary (D3-15)", () => {
  const fmt = (value: number) => String(value);
  const day = (key: string) => key;
  const dated = (values: (number | undefined)[]): TrendPoint[] => values.map((value, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, value }));

  it("ilk ve son ölçümü, yönü ve boşluk sayısını söyler", () => {
    expect(trendSummary(dated([100, undefined, 130]), fmt, day)).toBe(
      "İlk ölçüm 2026-09-01: 100. Son ölçüm 2026-09-03: 130. Genel olarak yükseldi. 1 günde ölçüm yok.",
    );
    expect(trendSummary(dated([130, 100]), fmt, day)).toContain("Genel olarak düştü.");
    expect(trendSummary(dated([5, 5]), fmt, day)).toContain("Genel olarak değişmedi.");
  });

  it("2'den az ölçüm varsa özet yok (yalnız grafiğin adı okunur)", () => {
    expect(trendSummary(dated([100, undefined]), fmt, day)).toBeUndefined();
    expect(trendSummary([], fmt, day)).toBeUndefined();
  });
});
