import { describe, expect, it } from "vitest";

import {
  CAPTION_MAX,
  captionLimitProblem,
  countCaptionChars,
  countHashtags,
  HASHTAG_MAX,
  isPublishedWithinQuotaWindow,
  type PublishStatus,
} from "@/lib/domain/publish";

describe("açıklama sayımı ve sınırları", () => {
  it("karakteri kod noktası olarak sayar: emoji 1, String.length 2", () => {
    expect(countCaptionChars("👍")).toBe(1);
    expect("👍".length).toBe(2);
    expect(countCaptionChars("kahve ☕ 👍👍")).toBe(10);
    expect(countCaptionChars("")).toBe(0);
  });

  it("2200 emoji sınırın içindedir (UTF-16'da 4400), 2201 emoji dışındadır", () => {
    const atLimit = "😀".repeat(CAPTION_MAX);
    expect(atLimit.length).toBe(CAPTION_MAX * 2);
    expect(captionLimitProblem(atLimit)).toBeUndefined();
    expect(captionLimitProblem(`${atLimit}😀`)).toMatch(/2200 karakter/);
  });

  it("hashtag sınırı: 30 geçerli, 31 geçersiz; kelime içi # sayılmaz", () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `#etiket${i}`).join(" ");
    expect(countHashtags(tags(HASHTAG_MAX))).toBe(30);
    expect(captionLimitProblem(tags(HASHTAG_MAX))).toBeUndefined();
    expect(captionLimitProblem(tags(HASHTAG_MAX + 1))).toMatch(/30 hashtag/);
    expect(countHashtags("a#b &#39; 5#")).toBe(0);
  });

  it("açıklama verilmediyse (undefined) sorun yok", () => {
    expect(captionLimitProblem(undefined)).toBeUndefined();
  });
});

describe("isPublishedWithinQuotaWindow (24 saatlik kota penceresi)", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const within = (status: PublishStatus, updatedAt: string) => isPublishedWithinQuotaWindow({ status, updatedAt }, now);

  it("yalnız published ve son 24 saatte: (now − 24s, now]", () => {
    expect(within("published", hoursAgo(2))).toBe(true);
    expect(within("published", hoursAgo(23.9))).toBe(true);
    expect(within("published", hoursAgo(0))).toBe(true); // tam şimdi dahil
    expect(within("published", hoursAgo(24))).toBe(false); // tam 24 saat önce dışarıda
    expect(within("published", hoursAgo(24.1))).toBe(false);
  });

  it("yayınlanmamış durum, gelecekteki zaman ve bozuk tarih sayılmaz", () => {
    expect(within("approved", hoursAgo(1))).toBe(false);
    expect(within("failed", hoursAgo(1))).toBe(false);
    expect(within("published", hoursAgo(-1))).toBe(false);
    expect(within("published", "geçersiz")).toBe(false);
  });
});
