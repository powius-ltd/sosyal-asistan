import { describe, expect, it } from "vitest";

import { nextPage, parseTrail, previousPage, writePage } from "@/components/common/cursor-trail";

describe("sayfa izi", () => {
  it("ilk sayfadan ikinciye: iz boş kalır (önceki sayfa = ilk sayfa)", () => {
    const second = nextPage({ trail: [] }, "c1");
    expect(second).toEqual({ cursor: "c1", trail: [] });
    expect(previousPage(second)).toEqual({ trail: [] });
  });

  it("üçüncü sayfada iz ikinci sayfanın imlecini taşır; geri gidince bir öncekine döner", () => {
    const third = nextPage({ cursor: "c1", trail: [] }, "c2");
    expect(third).toEqual({ cursor: "c2", trail: ["c1"] });
    expect(previousPage(third)).toEqual({ cursor: "c1", trail: [] });
    const fourth = nextPage(third, "c3");
    expect(fourth.trail).toEqual(["c1", "c2"]);
    expect(previousPage(fourth)).toEqual({ cursor: "c2", trail: ["c1"] });
  });

  it("ilk sayfada önceki sayfa yok", () => {
    expect(previousPage({ trail: [] })).toBeUndefined();
  });

  it("adresten okurken bozuk ve aşırı uzun değerler atılır", () => {
    expect(parseTrail(undefined)).toEqual([]);
    expect(parseTrail("a")).toEqual(["a"]);
    expect(parseTrail(["a", "", "x".repeat(300), "b"])).toEqual(["a", "b"]);
  });

  it("adrese tekrarlı parametre olarak yazılır", () => {
    const params = new URLSearchParams();
    writePage(params, { cursor: "c3", trail: ["c1", "c2"] });
    expect(params.toString()).toBe("cursor=c3&onceki=c1&onceki=c2");
  });
});
