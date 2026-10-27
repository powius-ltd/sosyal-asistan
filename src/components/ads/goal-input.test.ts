import { describe, expect, it } from "vitest";

import { buildGoalInput, goalSentence, parseLocaleNumber } from "@/components/ads/goal-input";

const base = { kind: "value", resultLabel: " satın alma ", targetReturn: "2,5", grossMargin: "", targetCost: "" } as const;

describe("buildGoalInput", () => {
  it("virgüllü sayıyı okur, marjı yüzdeden orana çevirir", () => {
    expect(buildGoalInput({ ...base, grossMargin: "40" })).toEqual({ ok: true, goal: { kind: "value", resultLabel: "satın alma", targetReturn: 2.5, grossMargin: 0.4 } });
    expect(buildGoalInput(base)).toEqual({ ok: true, goal: { kind: "value", resultLabel: "satın alma", targetReturn: 2.5 } });
  });
  it("maliyet modunda yalnız hedef maliyeti gönderir", () => {
    expect(buildGoalInput({ ...base, kind: "cost", targetCost: "15.5" })).toEqual({ ok: true, goal: { kind: "cost", resultLabel: "satın alma", targetCostPerResult: 15.5 } });
  });
  it("geçersiz sayı Türkçe hata verir", () => {
    expect(buildGoalInput({ ...base, targetReturn: "abc" })).toMatchObject({ ok: false, message: expect.stringContaining("Sayı") });
    expect(buildGoalInput({ ...base, grossMargin: "150" })).toMatchObject({ ok: false });
    expect(buildGoalInput({ ...base, kind: "cost", targetCost: "" })).toMatchObject({ ok: false });
  });
  it("parseLocaleNumber boşu ve sayı olmayanı reddeder", () => {
    expect(parseLocaleNumber(" ")).toBeUndefined();
    expect(parseLocaleNumber("1e999")).toBeUndefined();
    expect(parseLocaleNumber("0,5")).toBe(0.5);
  });
  it("goalSentence hedef yoksa undefined", () => {
    expect(goalSentence(undefined, "TRY")).toBeUndefined();
    expect(goalSentence({ kind: "cost", resultLabel: "mesaj", targetCostPerResult: 20 }, "TRY")).toContain("mesaj başına");
  });
});
