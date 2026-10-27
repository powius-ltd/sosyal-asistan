import { describe, expect, it } from "vitest";

import { LIFT_TIER_MIN as DOMAIN_TIER_MIN } from "@/lib/domain/content";
import { lift, LIFT_TIER_MIN, liftTier } from "@/lib/metrics/lift";

describe("lift", () => {
  it("views / medyan", () => {
    expect(lift(3000, { median: 1000 })).toBe(3);
    expect(lift(500, { median: 1000 })).toBe(0.5);
  });

  it("views 0 → lift 0 (ölçüldü, sıfır)", () => {
    expect(lift(0, { median: 1000 })).toBe(0);
  });

  it("hesaplanamayan → undefined (asla 0)", () => {
    expect(lift(undefined, { median: 1000 })).toBeUndefined();
    expect(lift(1000, { median: undefined })).toBeUndefined();
    expect(lift(1000, { median: 0 })).toBeUndefined();
    expect(lift(1000, { median: -10 })).toBeUndefined();
    expect(lift(1000, { median: Number.NaN })).toBeUndefined();
    expect(lift(0, { median: -10 })).toBeUndefined();
    expect(lift(1000, undefined)).toBeUndefined();
    expect(lift(Number.NaN, { median: 10 })).toBeUndefined();
    expect(lift(-5, { median: 10 })).toBeUndefined();
    expect(lift(Number.POSITIVE_INFINITY, { median: 10 })).toBeUndefined();
  });
});

describe("liftTier — sınırlar", () => {
  it("1.49→0, 1.5→1, 1.99→1, 2→2, 2.99→2, 3→3, 4.99→3, 5→4", () => {
    expect(liftTier(0)).toBe(0);
    expect(liftTier(1.49)).toBe(0);
    expect(liftTier(1.5)).toBe(1);
    expect(liftTier(1.99)).toBe(1);
    expect(liftTier(2)).toBe(2);
    expect(liftTier(2.99)).toBe(2);
    expect(liftTier(3)).toBe(3);
    expect(liftTier(4.99)).toBe(3);
    expect(liftTier(5)).toBe(4);
    expect(liftTier(120)).toBe(4);
  });

  it("undefined / sonlu olmayan → undefined (kademe 0 değil)", () => {
    expect(liftTier(undefined)).toBeUndefined();
    expect(liftTier(Number.NaN)).toBeUndefined();
  });

  it("eşikler domain'deki tek kaynaktan gelir", () => {
    expect(LIFT_TIER_MIN).toBe(DOMAIN_TIER_MIN);
  });
});
