import { describe, expect, it } from "vitest";

import { parseCapInput } from "@/components/settings/cap-input";

describe("parseCapInput", () => {
  it("sayıyı (nokta ya da virgülle) kabul eder; 0 ve 1000 geçerli", () => {
    expect(parseCapInput("5,5")).toEqual({ ok: true, value: 5.5 });
    expect(parseCapInput(" 12.25 ")).toEqual({ ok: true, value: 12.25 });
    expect(parseCapInput("0")).toEqual({ ok: true, value: 0 });
    expect(parseCapInput("1000")).toEqual({ ok: true, value: 1000 });
  });

  it("boş bırakılamaz (tavan kaldırılamaz)", () => {
    expect(parseCapInput("")).toMatchObject({ ok: false, message: expect.stringContaining("zorunlu") });
    expect(parseCapInput("   ")).toMatchObject({ ok: false });
  });

  it("sayı olmayan, negatif ve 1000'i aşan girdi reddedilir", () => {
    expect(parseCapInput("abc")).toMatchObject({ ok: false, message: "Tavan bir sayı olmalı." });
    expect(parseCapInput("-1")).toMatchObject({ ok: false, message: "Tavan negatif olamaz." });
    expect(parseCapInput("1000,01")).toMatchObject({ ok: false, message: expect.stringContaining("en fazla 1000") });
  });
});
