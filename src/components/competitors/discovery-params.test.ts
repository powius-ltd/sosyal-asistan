import { describe, expect, it } from "vitest";

import { parseDiscoveryParams, toDiscoveryFilter } from "@/components/competitors/discovery-params";

describe("parseDiscoveryParams", () => {
  it("boş girdide filtre yok", () => {
    const state = parseDiscoveryParams({});
    expect(state).toEqual({ source: undefined, similarSizeOnly: false });
    expect(toDiscoveryFilter(state)).toEqual({});
  });

  it("geçerli kaynak ve benzer boyu okur", () => {
    const state = parseDiscoveryParams({ kaynak: "related", benzer: "1" });
    expect(toDiscoveryFilter(state)).toEqual({ source: "related", similarSizeOnly: true });
  });

  it("bilinmeyen değerleri yok sayar; dizi gelirse ilkini alır", () => {
    expect(parseDiscoveryParams({ kaynak: "manual", benzer: "evet" })).toEqual({
      source: undefined,
      similarSizeOnly: false,
    });
    expect(parseDiscoveryParams({ kaynak: ["search", "related"] }).source).toBe("search");
  });
});
