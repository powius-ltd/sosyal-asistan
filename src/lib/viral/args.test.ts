import { describe, expect, it } from "vitest";

import { parseViralArgs } from "@/lib/viral/args";

describe("parseViralArgs", () => {
  it("varsayılanlar: para harcatan bayrak yok", () => {
    expect(parseViralArgs([])).toEqual({ topics: [], limit: 50, dryRun: false });
  });
  it("konu tekrarlanabilir, apify-max ve dry-run", () => {
    expect(parseViralArgs(["--konu=kahve", "--konu=yapay zeka", "--apify-max=1.5", "--dry-run", "--limit=20"])).toEqual({
      topics: ["kahve", "yapay zeka"],
      maxUsd: 1.5,
      limit: 20,
      dryRun: true,
    });
  });
  it("tavan üstü, bozuk sayı, boş konu ve bilinmeyen bayrak hata", () => {
    expect(() => parseViralArgs(["--apify-max=2"])).toThrow(/arasında/);
    expect(() => parseViralArgs(["--apify-max=abc"])).toThrow();
    expect(() => parseViralArgs(["--limit=0"])).toThrow();
    expect(() => parseViralArgs(["--konu="])).toThrow();
    expect(() => parseViralArgs(["--apifymax=1"])).toThrow(/Bilinmeyen/);
  });
});
