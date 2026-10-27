import { describe, expect, it } from "vitest";

import { parseAdPeriod } from "@/components/ads/period";

describe("parseAdPeriod", () => {
  it("yalnız 7 / 14 / 28 geçerli, geri kalan 28", () => {
    expect(parseAdPeriod("7")).toBe(7);
    expect(parseAdPeriod("14")).toBe(14);
    expect(parseAdPeriod(undefined)).toBe(28);
    expect(parseAdPeriod("999")).toBe(28);
    expect(parseAdPeriod("abc")).toBe(28);
  });
});
