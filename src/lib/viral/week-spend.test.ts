import { describe, expect, it } from "vitest";

import { istanbulWeekStartIso, remainingWeeklyUsd, sumSpendUsd } from "@/lib/viral/week-spend";
import { VIRAL_WEEKLY_CAP_USD } from "@/lib/viral/thresholds";

describe("viral haftalık tavan (k5)", () => {
  it("kesinleşen tutar yoksa rezerve tutar sayılır; hafta toplamı tavandan düşer", () => {
    expect(sumSpendUsd([{ reserved_usd: 0.5, actual_usd: 0.2 }, { reserved_usd: 0.4, actual_usd: null }, { reserved_usd: null, actual_usd: null }])).toBeCloseTo(0.6);
    expect(remainingWeeklyUsd(0)).toBe(VIRAL_WEEKLY_CAP_USD);
    expect(remainingWeeklyUsd(0.6)).toBeCloseTo(VIRAL_WEEKLY_CAP_USD - 0.6);
  });
  it("tavan dolduysa ya da aşıldıysa kalan 0'dır (negatif değil)", () => {
    expect(remainingWeeklyUsd(VIRAL_WEEKLY_CAP_USD)).toBe(0);
    expect(remainingWeeklyUsd(VIRAL_WEEKLY_CAP_USD + 3)).toBe(0);
  });
});

describe("viral haftanın başı (k5): İstanbul Pazartesi 00:00", () => {
  it("Pazartesi 01:00 İstanbul (Pazar 22:00 UTC) o haftaya sayılır; Pazar 23:30 İstanbul önceki haftada kalır", () => {
    // 2026-10-19 Pazartesi. Pazartesi 01:00 İstanbul = 18 Ekim 22:00 UTC → hafta başı 18 Ekim 21:00 UTC.
    expect(istanbulWeekStartIso(new Date("2026-10-18T22:00:00Z"))).toBe("2026-10-18T21:00:00.000Z");
    expect(istanbulWeekStartIso(new Date("2026-10-18T22:00:00Z"))).not.toBe("2026-10-19T00:00:00.000Z");
    // Pazar 23:30 İstanbul = 20:30 UTC → önceki hafta (12 Ekim Pazartesi İstanbul 00:00 = 11 Ekim 21:00 UTC).
    expect(istanbulWeekStartIso(new Date("2026-10-18T20:30:00Z"))).toBe("2026-10-11T21:00:00.000Z");
    // Çarşamba öğleni.
    expect(istanbulWeekStartIso(new Date("2026-10-21T09:00:00Z"))).toBe("2026-10-18T21:00:00.000Z");
  });
});
