import { describe, expect, it } from "vitest";

import { isVideoUrlExpired, matchVideoUrls, mustRecollect, partitionVideos, type VideoNeed } from "@/lib/intel/video-source";
import type { NormalizedContent } from "@/lib/platforms/types";

const NOW = new Date("2026-09-30T12:00:00Z");
const hex = (date: string) => Math.floor(Date.parse(date) / 1000).toString(16);
const live = `https://scontent.cdninstagram.com/v/a.mp4?oe=${hex("2026-10-05T00:00:00Z")}&sig=x`;
const dead = `https://scontent.cdninstagram.com/v/b.mp4?oe=${hex("2026-09-29T00:00:00Z")}&sig=y`;

const need = (contentId: string, externalId: string, shortcode?: string): VideoNeed => ({ contentId, externalId, shortcode, platform: "instagram", ownerId: "o", handle: "h" });
const item = (externalId: string, url: string | undefined, shortcode?: string): NormalizedContent => ({
  platform: "instagram",
  externalId,
  shortcode,
  format: "short_video",
  hashtags: [],
  metrics: { extra: {} },
  missingFields: [],
  ephemeralMediaUrl: url,
});

describe("matchVideoUrls", () => {
  it("önce externalId, yoksa shortcode ile eşler; adresi olmayan öğe eşleşmez", () => {
    const found = matchVideoUrls([need("c1", "111"), need("c2", "222", "SC2"), need("c3", "333")], [item("111", live), item("999", dead, "SC2"), item("333", undefined)]);
    expect(found.get("c1")).toBe(live);
    expect(found.get("c2")).toBe(dead);
    expect(found.has("c3")).toBe(false);
  });
});

describe("isVideoUrlExpired", () => {
  it("oe geçmişteyse dolmuş; gelecekteyse değil; oe yoksa/okunamıyorsa dolmuş SAYILMAZ", () => {
    expect(isVideoUrlExpired(dead, NOW)).toBe(true);
    expect(isVideoUrlExpired(live, NOW)).toBe(false);
    expect(isVideoUrlExpired("https://scontent.cdninstagram.com/v/c.mp4", NOW)).toBe(false);
    expect(isVideoUrlExpired("not a url", NOW)).toBe(false);
  });
});

describe("partitionVideos / mustRecollect", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("hazır / süresi dolmuş / adres yok olarak ayırır, sırayı korur", () => {
    const part = partitionVideos(items, new Map([["a", live], ["b", dead]]), NOW);
    expect(part.ready.map((r) => r.item.id)).toEqual(["a"]);
    expect(part.expired.map((i) => i.id)).toEqual(["b"]);
    expect(part.missing.map((i) => i.id)).toEqual(["c"]);
    expect(mustRecollect(part)).toBe(false);
  });

  it("hepsi dolmuş/eksikse durulur (collect:now gerekir); hiç video seçilmediyse durulmaz", () => {
    expect(mustRecollect(partitionVideos(items, new Map([["a", dead]]), NOW))).toBe(true);
    expect(mustRecollect(partitionVideos([], new Map(), NOW))).toBe(false);
  });
});
