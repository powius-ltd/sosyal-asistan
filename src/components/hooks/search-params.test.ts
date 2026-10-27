import { describe, expect, it } from "vitest";

import {
  buildHookHref,
  buildHookPageHref,
  clearedHookFilters,
  hasActiveHookFilters,
  HOOK_PAGE_SIZE,
  parseHookParams,
  toHookFilter,
  type HookUiState,
} from "@/components/hooks/search-params";

const DEFAULT_STATE: HookUiState = { source: "all", sort: "lift", trail: [] };

describe("parseHookParams", () => {
  it("boş URL → varsayılan durum (lift sırası, hepsi)", () => {
    expect(parseHookParams({})).toEqual({
      hookType: undefined,
      minTier: undefined,
      source: "all",
      q: undefined,
      sort: "lift",
      cursor: undefined,
      trail: [],
    });
  });

  it("geçerli değerleri okur", () => {
    const state = parseHookParams({
      tur: "shock_stat",
      kademe: "3",
      kaynak: "rakip",
      q: "  kahve  ",
      sirala: "yeni",
      cursor: "abc",
    });
    expect(state).toEqual({ hookType: "shock_stat", minTier: 3, source: "competitor", q: "kahve", sort: "recent", cursor: "abc", trail: [] });
  });

  it("kademe URL değeri lift eşiğidir: 1.5→1, 2→2, 3→3, 5→4", () => {
    expect(parseHookParams({ kademe: "1.5" }).minTier).toBe(1);
    expect(parseHookParams({ kademe: "2" }).minTier).toBe(2);
    expect(parseHookParams({ kademe: "5" }).minTier).toBe(4);
  });

  it("bozuk değerler sessizce düşer (whitelist)", () => {
    const state = parseHookParams({
      tur: "Bad Type!",
      kademe: "9",
      kaynak: "hepsi-degil",
      sirala: "rastgele",
      cursor: "x".repeat(300),
    });
    expect(state).toEqual({ ...DEFAULT_STATE, hookType: undefined, minTier: undefined, q: undefined, cursor: undefined });
  });

  it("dizi gelirse ilk değer; aşırı uzun arama kırpılır; boş arama yok sayılır", () => {
    expect(parseHookParams({ tur: ["question", "list"] }).hookType).toBe("question");
    expect(parseHookParams({ q: "a".repeat(500) }).q).toHaveLength(100);
    expect(parseHookParams({ q: "   " }).q).toBeUndefined();
  });
});

describe("toHookFilter", () => {
  it("varsayılan durum: yalnız sıralama ve sayfa boyutu", () => {
    expect(toHookFilter(DEFAULT_STATE)).toEqual({ sort: "lift", limit: HOOK_PAGE_SIZE });
  });

  it("kendi/rakip → own true/false; hepsi → own yok", () => {
    expect(toHookFilter({ ...DEFAULT_STATE, source: "own" }).own).toBe(true);
    expect(toHookFilter({ ...DEFAULT_STATE, source: "competitor" }).own).toBe(false);
    expect("own" in toHookFilter(DEFAULT_STATE)).toBe(false);
  });

  it("tüm filtreler depo filtresine geçer", () => {
    expect(
      toHookFilter({ hookType: "question", minTier: 3, source: "own", q: "kahve", sort: "recent", cursor: "c1", trail: [] }),
    ).toEqual({ hookType: "question", minTier: 3, own: true, q: "kahve", sort: "recent", limit: HOOK_PAGE_SIZE, cursor: "c1" });
  });
});

describe("buildHookHref", () => {
  it("varsayılan durum → yalın rota", () => {
    expect(buildHookHref(DEFAULT_STATE)).toBe("/tutanlar/hooklar");
  });

  it("yalnız varsayılandan farklı değerler yazılır; imleç ayrıca verilir", () => {
    const href = buildHookHref(
      { hookType: "list", minTier: 4, source: "own", q: "sabah kahve", sort: "recent", cursor: "eski", trail: [] },
      "yeni-imlec",
    );
    const params = new URL(href, "http://x").searchParams;
    expect(Object.fromEntries(params)).toEqual({
      tur: "list",
      kademe: "5",
      kaynak: "kendi",
      q: "sabah kahve",
      sirala: "yeni",
      cursor: "yeni-imlec",
      onceki: "eski",
    });
  });

  it("gidiş-dönüş: href'i ayrıştırınca aynı durum çıkar", () => {
    const state: HookUiState = { hookType: "pov", minTier: 2, source: "competitor", q: "İşte", sort: "recent", trail: [] };
    const params = Object.fromEntries(new URL(buildHookHref(state), "http://x").searchParams);
    expect(parseHookParams(params)).toEqual({ ...state, cursor: undefined });
  });
});

describe("hasActiveHookFilters / clearedHookFilters", () => {
  it("sıralama filtre sayılmaz", () => {
    expect(hasActiveHookFilters(DEFAULT_STATE)).toBe(false);
    expect(hasActiveHookFilters({ ...DEFAULT_STATE, sort: "recent" })).toBe(false);
    expect(hasActiveHookFilters({ ...DEFAULT_STATE, q: "x" })).toBe(true);
    expect(hasActiveHookFilters({ ...DEFAULT_STATE, minTier: 1 })).toBe(true);
    expect(hasActiveHookFilters({ ...DEFAULT_STATE, source: "own" })).toBe(true);
    expect(hasActiveHookFilters({ ...DEFAULT_STATE, hookType: "list" })).toBe(true);
  });

  it("temizleyince sıralama korunur", () => {
    expect(clearedHookFilters({ hookType: "list", minTier: 2, source: "own", q: "x", sort: "recent", cursor: "c", trail: ["b"] })).toEqual({
      source: "all",
      sort: "recent",
      trail: [],
    });
  });
});

describe("önceki sayfa izi", () => {
  it("imleç varsa iz okunur; imleç yoksa iz yok sayılır", () => {
    expect(parseHookParams({ cursor: "c3", onceki: ["c1", "c2"] }).trail).toEqual(["c1", "c2"]);
    expect(parseHookParams({ onceki: ["c1"] }).trail).toEqual([]);
  });

  it("sonraki sayfa bu sayfanın imlecini ize ekler; ilk sayfa izsizdir", () => {
    const second = parseHookParams({ cursor: "c1" });
    const params = new URL(buildHookHref(second, "c2"), "http://x").searchParams;
    expect(params.get("cursor")).toBe("c2");
    expect(params.getAll("onceki")).toEqual(["c1"]);
    expect(buildHookHref(second)).toBe("/tutanlar/hooklar");
  });
});

describe("reklam süzgeci (`reklam=1`)", () => {
  it("yalnız '1' açar; yoksa alan çıkmaz; URL'ye yazılır, temizle kapatır", () => {
    expect(parseHookParams({ reklam: "1" }).adsUsed).toBe(true);
    expect(parseHookParams({ reklam: "evet" }).adsUsed).toBeUndefined();
    expect(parseHookParams({}).adsUsed).toBeUndefined();
    const on = parseHookParams({ reklam: "1", kaynak: "kendi" });
    expect(buildHookPageHref(on, { trail: [] })).toBe("/tutanlar/hooklar?kaynak=kendi&reklam=1");
    expect(hasActiveHookFilters(on)).toBe(true);
    expect(clearedHookFilters(on).adsUsed).toBeUndefined();
  });
});
