import { describe, expect, it } from "vitest";

import { DAY_MS, hourLabel, hourRangeLabel, WEEKDAY_LABELS, WEEKDAY_NAMES, weekdayName } from "@/lib/time";

describe("lib/time", () => {
  it("bir gün 24 saattir", () => {
    expect(DAY_MS).toBe(86_400_000);
  });

  it("gün adları WEEKDAY_LABELS ile aynı sıradadır (Pzt = 0)", () => {
    expect(WEEKDAY_NAMES).toHaveLength(WEEKDAY_LABELS.length);
    expect([...WEEKDAY_NAMES]).toEqual(["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]);
    expect(weekdayName(0)).toBe("Pazartesi");
    expect(weekdayName(5)).toBe("Cumartesi");
    expect(weekdayName(6)).toBe("Pazar");
  });

  it("aralık dışı ya da tam sayı olmayan gün → undefined", () => {
    for (const bad of [-1, 7, 1.5, Number.NaN]) expect(weekdayName(bad)).toBeUndefined();
  });

  it("saat etiketi iki basamaklıdır; aralık gün sonunda 00:00'a taşar", () => {
    expect(hourLabel(9)).toBe("09:00");
    expect(hourLabel(0)).toBe("00:00");
    expect(hourRangeLabel(20)).toBe("20:00–21:00");
    expect(hourRangeLabel(23)).toBe("23:00–00:00");
  });
});
