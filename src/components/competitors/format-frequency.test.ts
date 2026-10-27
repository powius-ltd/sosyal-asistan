import { describe, expect, it } from "vitest";

import { formatFrequency } from "@/components/competitors/format-frequency";

describe("formatFrequency", () => {
  it("haftalık, aylık ve ölçülemeyen", () => {
    expect(formatFrequency(5.7)).toBe("~6 / hafta");
    expect(formatFrequency(0.5)).toBe("~2 / ay");
    expect(formatFrequency(0.05)).toBe("<1 / ay");
    expect(formatFrequency(undefined)).toBeUndefined();
    expect(formatFrequency(Number.NaN)).toBeUndefined();
  });
});
