import { describe, expect, it } from "vitest";

import { ilerletRefusal } from "@/lib/cycle/enabled";

describe("ilerletRefusal (Ö10)", () => {
  it("gerçek koşu CYCLE_AUTO=on ister; kuru koşu her zaman serbest", () => {
    expect(ilerletRefusal({}, false)).toMatch(/CYCLE_AUTO=on/);
    expect(ilerletRefusal({ CYCLE_AUTO: "off" }, false)).toBeDefined();
    expect(ilerletRefusal({ CYCLE_AUTO: "on" }, false)).toBeUndefined();
    expect(ilerletRefusal({}, true)).toBeUndefined();
  });
});
