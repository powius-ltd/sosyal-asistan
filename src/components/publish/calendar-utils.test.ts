import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  bucketByDay,
  isDayKey,
  monthTitle,
  monthWeeks,
  startOfWeek,
  weekDays,
  weekTitle,
} from "@/components/publish/calendar-utils";

describe("calendar-utils", () => {
  it("isDayKey yalnız gerçek takvim günlerini kabul eder", () => {
    expect(isDayKey("2026-09-30")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-9-3")).toBe(false);
    expect(isDayKey(undefined)).toBe(false);
  });

  it("hafta Pazartesi başlar (2026-09-30 Çarşamba)", () => {
    expect(startOfWeek("2026-09-30")).toBe("2026-09-28");
    expect(startOfWeek("2026-09-27")).toBe("2026-09-21"); // Pazar önceki haftaya ait
    expect(weekDays("2026-09-30")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("gün ve ay kaydırma ay/yıl sınırını geçer", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-01");
  });

  it("ay ızgarası tam haftalardan oluşur ve ayın ilk/son gününü kapsar", () => {
    const weeks = monthWeeks("2026-09-15");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toBe("2026-08-31"); // 1 Eylül Salı → hafta Pazartesi 31 Ağustos'ta başlar
    expect(weeks.flat()).toContain("2026-09-30");
    expect(weeks.at(-1)?.at(-1)).toBe("2026-10-04");
  });

  it("başlıklar Türkçe", () => {
    expect(monthTitle("2026-09-30")).toBe("Eylül 2026");
    expect(weekTitle("2026-09-30")).toBe("28 Eyl – 4 Eki 2026");
    expect(weekTitle("2026-12-30")).toBe("28 Ara 2026 – 3 Oca 2027");
    expect(weekTitle("2026-10-07")).toBe("5 – 11 Eki 2026");
  });

  it("bucketByDay işi workspace saat dilimindeki gününe koyar (UTC değil)", () => {
    // 2026-09-30T21:30Z = İstanbul'da 1 Ekim 00:30 → 1 Ekim'e düşer.
    const items = [
      { id: "a", at: "2026-09-30T21:30:00.000Z" },
      { id: "b", at: "2026-09-30T08:00:00.000Z" },
      { id: "c", at: undefined },
    ];
    const buckets = bucketByDay(items, (i) => i.at, "Europe/Istanbul");
    expect(buckets.get("2026-10-01")?.map((i) => i.id)).toEqual(["a"]);
    expect(buckets.get("2026-09-30")?.map((i) => i.id)).toEqual(["b"]);
    expect([...buckets.values()].flat()).toHaveLength(2);
  });
});
