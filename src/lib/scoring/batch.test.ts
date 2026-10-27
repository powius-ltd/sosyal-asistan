import { describe, expect, it } from "vitest";

import { chunk, mapConcurrent } from "@/lib/scoring/batch";

describe("chunk", () => {
  it("sıra korunarak en çok `size` elemanlı parçalar", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    expect(chunk([], 3)).toEqual([]);
  });

  it("pozitif tam sayı olmayan boyut reddedilir", () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(() => chunk([1], 1.5)).toThrow(RangeError);
  });
});

describe("mapConcurrent", () => {
  it("sonuçlar girdi sırasıyla; aynı anda en çok `limit` iş", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapConcurrent([30, 10, 20, 5, 15], 2, async (ms, index) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running -= 1;
      return index * 10;
    });
    expect(out).toEqual([0, 10, 20, 30, 40]);
    expect(peak).toBe(2);
  });

  it("ilk hata sonucu reddeder ve yeni iş başlatmaz", async () => {
    const started: number[] = [];
    await expect(
      mapConcurrent([1, 2, 3, 4], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error("bozuk");
        return n;
      }),
    ).rejects.toThrow("bozuk");
    expect(started).toEqual([1, 2]);
  });

  it("boş liste → boş sonuç; geçersiz limit reddedilir", async () => {
    await expect(mapConcurrent([], 3, async () => 1)).resolves.toEqual([]);
    await expect(mapConcurrent([1], 0, async () => 1)).rejects.toThrow(RangeError);
  });
});
