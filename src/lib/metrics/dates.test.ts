import { describe, expect, it } from "vitest";

import { DAY_MS, isValidDate } from "@/lib/metrics/dates";

describe("dates", () => {
  it("DAY_MS 24 saattir", () => {
    expect(DAY_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("isValidDate: undefined ve Invalid Date → false", () => {
    expect(isValidDate(new Date("2026-09-30T12:00:00Z"))).toBe(true);
    expect(isValidDate(new Date(0))).toBe(true);
    expect(isValidDate(undefined)).toBe(false);
    expect(isValidDate(new Date("geçersiz"))).toBe(false);
  });
});
