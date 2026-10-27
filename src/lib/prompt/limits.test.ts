import { describe, expect, it } from "vitest";

import { cap } from "@/lib/prompt/limits";
import { promptLift, promptNumber } from "@/lib/prompt/numbers";

describe("cap", () => {
  it("tek satıra indirir ve keser", () => {
    expect(cap("a\n\n  b", 10)).toBe("a b");
    expect(cap("x".repeat(20), 5)).toBe("xxxx…");
  });

  it("boş/undefined → undefined", () => {
    expect(cap(undefined, 5)).toBeUndefined();
    expect(cap("  \n ", 5)).toBeUndefined();
  });
});

describe("promptNumber / promptLift", () => {
  it("Türkçe: tr-TR biçimi", () => {
    expect(promptNumber(1_250_000, "tr")).toBe("1.250.000");
    expect(promptLift(4.62, "tr")).toBe("4,6x");
    expect(promptLift(3, "tr")).toBe("3x");
  });

  it("İngilizce: virgül gruplama, nokta ondalık", () => {
    expect(promptNumber(1_250_000, "en")).toBe("1,250,000");
    expect(promptNumber(999, "en")).toBe("999");
    expect(promptLift(4.62, "en")).toBe("4.6x");
    expect(promptLift(3, "en")).toBe("3x");
  });

  it("1'in altındaki gerçek lift iki ondalık; sıfır gerçek 0x", () => {
    expect(promptLift(0.04, "tr")).toBe("0,04x");
    expect(promptLift(0.04, "en")).toBe("0.04x");
    expect(promptLift(0, "tr")).toBe("0x");
  });

  it("ölçülemeyen → undefined (0 değil)", () => {
    expect(promptNumber(undefined, "tr")).toBeUndefined();
    expect(promptNumber(Number.NaN, "en")).toBeUndefined();
    expect(promptLift(undefined, "tr")).toBeUndefined();
    expect(promptLift(Number.POSITIVE_INFINITY, "en")).toBeUndefined();
    expect(promptNumber(0, "en")).toBe("0");
  });
});
