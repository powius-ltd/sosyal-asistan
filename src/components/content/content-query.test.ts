import { describe, expect, it } from "vitest";

import {
  clearedFilters,
  contentHref,
  hasActiveFilters,
  isoDaysAgo,
  nextPageQuery,
  pageNumber,
  prevPageQuery,
  withFilters,
  type ContentQuery,
} from "@/components/content/content-query";
import { parseContentQuery, toContentFilter } from "@/components/content/parse-content-query";

const base: ContentQuery = { sort: "tarih", history: [] };
const accountIds = ["oa_1", "oa_2"];

describe("contentHref", () => {
  it("varsayılan durumda temiz yol döner", () => {
    expect(contentHref(base)).toBe("/icerikler");
  });

  it("yalnız varsayılandan farklı değerleri yazar", () => {
    const href = contentHref({ account: "oa_1", format: "carousel", days: 30, sort: "lift", history: [] });
    expect(href).toBe("/icerikler?hesap=oa_1&format=carousel&gun=30&sirala=lift");
  });

  it("filtre değişince sayfalama sıfırlanır", () => {
    const paged: ContentQuery = { ...base, cursor: "50", history: ["25"] };
    expect(withFilters(paged, { format: "image" })).toEqual({ sort: "tarih", format: "image", history: [], cursor: undefined });
  });
});

describe("sayfalama gezinmesi", () => {
  it("ileri-geri gidince aynı imleçlere döner", () => {
    const page1 = base;
    const page2 = nextPageQuery(page1, "25");
    const page3 = nextPageQuery(page2, "50");

    expect(pageNumber(page1)).toBe(1);
    expect(pageNumber(page2)).toBe(2);
    expect(pageNumber(page3)).toBe(3);
    expect(page3).toMatchObject({ cursor: "50", history: ["25"] });

    expect(prevPageQuery(page3)).toMatchObject({ cursor: "25", history: [] });
    expect(prevPageQuery(page2)).toMatchObject({ cursor: undefined, history: [] });
    expect(prevPageQuery(page1)).toBeUndefined();
  });
});

describe("filtre yardımcıları", () => {
  it("sıralama filtre sayılmaz; temizleyince yalnız sıralama kalır", () => {
    expect(hasActiveFilters({ ...base, sort: "lift" })).toBe(false);
    const query: ContentQuery = { account: "oa_1", days: 7, sort: "lift", cursor: "25", history: [] };
    expect(hasActiveFilters(query)).toBe(true);
    expect(clearedFilters(query)).toEqual({ sort: "lift", history: [] });
  });

  it("isoDaysAgo verilen andan geriye sayar", () => {
    expect(isoDaysAgo(7, new Date("2026-09-30T00:00:00.000Z"))).toBe("2026-09-23T00:00:00.000Z");
  });
});

describe("parseContentQuery", () => {
  it("geçerli parametreleri okur", () => {
    const query = parseContentQuery(
      { hesap: "oa_2", format: "short_video", gun: "90", sirala: "izlenme" },
      accountIds,
    );
    expect(query).toEqual({ account: "oa_2", format: "short_video", days: 90, sort: "izlenme", cursor: undefined, history: [] });
  });

  it("geçersiz değerleri sessizce düşürür", () => {
    const query = parseContentQuery(
      { hesap: "baska_hesap", format: "podcast", gun: "365", sirala: "rastgele", imlec: "" },
      accountIds,
    );
    expect(query).toEqual({ account: undefined, format: undefined, days: undefined, sort: "tarih", cursor: undefined, history: [] });
  });

  it("dizi olarak gelen parametrede ilk değeri alır", () => {
    expect(parseContentQuery({ hesap: ["oa_1", "oa_2"] }, accountIds).account).toBe("oa_1");
  });

  it("bozuk kodlanmış geçmiş belirteci çökertmez", () => {
    const query = parseContentQuery({ imlec: "50", gecmis: "25,%E0%A4%A,75" }, accountIds);
    expect(query.history).toEqual(["25", "75"]);
  });

  it("imleç yokken geçmişi yok sayar", () => {
    expect(parseContentQuery({ gecmis: "25" }, accountIds).history).toEqual([]);
  });

  it("contentHref ile gidiş-dönüş tutarlıdır (virgüllü imleç dahil)", () => {
    const query: ContentQuery = { sort: "lift", cursor: "c,3", history: ["a,1", "b%2"] };
    const params = Object.fromEntries(new URL(contentHref(query), "http://x").searchParams);
    expect(parseContentQuery(params, accountIds)).toEqual({ ...query, account: undefined, format: undefined, days: undefined });
  });
});

const NOW = new Date("2026-09-30T00:00:00.000Z");

describe("toContentFilter", () => {
  it("yalnız kendi hesap içeriklerini, sayfa boyutuyla ister", () => {
    const filter = toContentFilter({ account: "oa_1", format: "image", days: 30, sort: "izlenme", history: [] }, NOW);
    expect(filter.ownerKind).toBe("own");
    expect(filter.ownerId).toBe("oa_1");
    expect(filter.limit).toBe(25);
    // Verilen `now`a göre: 30 gün önce (sayfa içinde ayrı saat okunmaz).
    expect(filter.since).toBe("2026-08-31T00:00:00.000Z");
  });

  it("sıralama anahtarını sözleşmedeki değere çevirir", () => {
    expect(toContentFilter({ sort: "tarih", history: [] }, NOW).sort).toBe("recent");
    expect(toContentFilter({ sort: "izlenme", history: [] }, NOW).sort).toBe("views");
    expect(toContentFilter({ sort: "lift", history: [] }, NOW).sort).toBe("lift");
    expect(toContentFilter({ sort: "lift", history: [] }, NOW).since).toBeUndefined();
  });
});
