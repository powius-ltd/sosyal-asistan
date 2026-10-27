import { describe, expect, it } from "vitest";

import { previousPage } from "@/components/common/cursor-trail";
import {
  buildOutlierHref,
  buildOutlierPageHref,
  hasActiveFilters,
  PAGE_SIZE,
  parseOutlierParams,
  toOutlierFilter,
} from "@/components/outliers/search-params";

const NOW = new Date("2026-09-30T12:00:00.000Z");

describe("parseOutlierParams", () => {
  it("boş URL varsayılanları verir: kademe 3, lift sıralı, kart görünümü", () => {
    const state = parseOutlierParams({});
    expect(state).toMatchObject({ minTier: 3, sort: "lift", view: "cards", similar: false });
    expect(state.platform).toBeUndefined();
    expect(hasActiveFilters(state)).toBe(false);
    expect(toOutlierFilter(state, NOW)).toEqual({ minTier: 3, sort: "lift", limit: PAGE_SIZE });
  });

  it("geçerli değerleri okur ve filtreye çevirir", () => {
    const state = parseOutlierParams({
      platform: "instagram",
      format: "short_video",
      kademe: "5",
      gun: "30",
      benzer: "1",
      guvenilir: "1",
      olgun: "1",
      sirala: "cross",
      gorunum: "table",
      cursor: "24",
    });
    expect(state.minTier).toBe(4);
    expect(hasActiveFilters(state)).toBe(true);
    expect(toOutlierFilter(state, NOW)).toEqual({
      platform: "instagram",
      format: "short_video",
      minTier: 4,
      since: "2026-08-31T12:00:00.000Z",
      similarSizeOnly: true,
      hideLowConfidence: true,
      hideImmature: true,
      sort: "cross",
      limit: PAGE_SIZE,
      cursor: "24",
    });
  });

  it("bozuk değerleri varsayılana düşürür", () => {
    const state = parseOutlierParams({ platform: "myspace", kademe: "9", gun: "45", sirala: "x", gorunum: "?" });
    expect(state).toMatchObject({ minTier: 3, sort: "lift", view: "cards" });
    expect(state.platform).toBeUndefined();
    expect(state.days).toBeUndefined();
  });

  it("1,5x kademesi URL'de '1.5' olarak gider ve geri okunur", () => {
    const state = parseOutlierParams({ kademe: "1.5" });
    expect(state.minTier).toBe(1);
    expect(buildOutlierHref(state)).toBe("/tutanlar?kademe=1.5");
  });
});

describe("buildOutlierHref", () => {
  it("varsayılan durum yalın rota; cursor eklenir", () => {
    const state = parseOutlierParams({});
    expect(buildOutlierHref(state)).toBe("/tutanlar");
    expect(buildOutlierHref(state, "24")).toBe("/tutanlar?cursor=24");
  });

  it("parse → build gidiş-dönüş verir", () => {
    const raw = { platform: "instagram", gun: "7", benzer: "1", sirala: "recent", gorunum: "table" };
    const href = buildOutlierHref(parseOutlierParams(raw));
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseOutlierParams(params)).toEqual(parseOutlierParams(raw));
  });

  it("ikinci sayfadan sonrası: bu sayfanın imleci ize eklenir; önceki sayfa bağlantısı izi geri alır", () => {
    const second = parseOutlierParams({ cursor: "24" });
    expect(second.trail).toEqual([]);
    const toThird = new URL(buildOutlierHref(second, "48"), "http://x").searchParams;
    expect(toThird.get("cursor")).toBe("48");
    expect(toThird.getAll("onceki")).toEqual(["24"]);

    const third = parseOutlierParams({ cursor: "48", onceki: ["24"] });
    expect(third.trail).toEqual(["24"]);
    const back = previousPage(third);
    expect(back && buildOutlierPageHref(third, back)).toBe("/tutanlar?cursor=24");
    expect(buildOutlierHref(third)).toBe("/tutanlar");
  });
});
