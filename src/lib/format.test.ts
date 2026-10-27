import { describe, expect, it } from "vitest";

import {
  formatCompact,
  formatDate,
  formatDateTime,
  formatDecimal,
  formatDuration,
  formatElapsed,
  formatLift,
  formatNumber,
  formatPercent,
  formatMoney,
  formatUsd,
  toDayKey,
} from "@/lib/format";

describe("formatCompact", () => {
  it("1000 altını olduğu gibi yazar", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(950)).toBe("950");
  });

  it("bin / milyon / milyar birimleri ve virgüllü ondalık", () => {
    expect(formatCompact(12345)).toBe("12,3 B");
    expect(formatCompact(12000)).toBe("12 B");
    expect(formatCompact(1_500_000)).toBe("1,5 Mn");
    expect(formatCompact(2_100_000_000)).toBe("2,1 Mr");
  });

  it("yuvarlama üst birime taşarsa \"1.000 B\" yazmaz", () => {
    expect(formatCompact(999_960)).toBe("1 Mn");
  });

  it("negatif sayı ve ölçülemeyen girdi", () => {
    expect(formatCompact(-12345)).toBe("-12,3 B");
    expect(formatCompact(undefined)).toBeUndefined();
    expect(formatCompact(Number.NaN)).toBeUndefined();
  });
});

describe("diğer sayı biçimleri", () => {
  it("formatNumber tr-TR gruplama kullanır", () => {
    expect(formatNumber(1234567)).toBe("1.234.567");
    expect(formatNumber(undefined)).toBeUndefined();
  });

  it("formatPercent oranı %12,3 biçiminde yazar; 0 → %0 (ölçüm), undefined → undefined", () => {
    expect(formatPercent(0.1234)).toBe("%12,3");
    expect(formatPercent(0)).toBe("%0");
    expect(formatPercent(undefined)).toBeUndefined();
  });

  it("formatDecimal: sabit basamak, tr-TR virgül ve binlik nokta; ölçülemeyen → undefined", () => {
    expect(formatDecimal(12.345, 1)).toBe("12,3");
    expect(formatDecimal(0.8, 2)).toBe("0,80");
    expect(formatDecimal(1234.56, 1)).toBe("1.234,6");
    expect(formatDecimal(5, 0)).toBe("5");
    expect(formatDecimal(-3.14159, 2)).toBe("-3,14");
    expect(formatDecimal(0, 1)).toBe("0,0");
    expect(formatDecimal(7)).toBe("7,0");
    expect(formatDecimal(undefined, 1)).toBeUndefined();
    expect(formatDecimal(null, 1)).toBeUndefined();
    expect(formatDecimal(Number.NaN, 1)).toBeUndefined();
    expect(formatDecimal(Number.POSITIVE_INFINITY, 1)).toBeUndefined();
  });

  it("formatLift", () => {
    expect(formatLift(5.25)).toBe("5,3x");
    expect(formatLift(undefined)).toBeUndefined();
  });

  it("formatMoney: para birimine göre, ölçülemeyen undefined, tanınmayan kod uydurulmaz", () => {
    expect(formatMoney(12.5, "USD")).toBe(formatUsd(12.5));
    expect(formatMoney(1250, "TRY")).toBe("₺1.250,00");
    expect(formatMoney(1250, "try")).toBe("₺1.250,00");
    expect(formatMoney(0, "EUR")).toBe("€0,00");
    expect(formatMoney(0.0023, "USD")).toBe("$0,0023");
    expect(formatMoney(undefined, "TRY")).toBeUndefined();
    expect(formatMoney(Number.NaN, "TRY")).toBeUndefined();
    expect(formatMoney(12.5, "XX1")).toBe("12,50 XX1");
  });

  it("formatUsd: normal tutar 2 basamak, 1 sentin altı 4 basamak", () => {
    expect(formatUsd(12.5)).toBe("$12,50");
    expect(formatUsd(0.0023)).toBe("$0,0023");
    expect(formatUsd(0)).toBe("$0,00");
    expect(formatUsd(undefined)).toBeUndefined();
  });

  it("formatDuration", () => {
    expect(formatDuration(34)).toBe("0:34");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(undefined)).toBeUndefined();
  });

  it("formatElapsed: geçen süre sözle, en büyük iki birim", () => {
    expect(formatElapsed(0.4)).toBe("1 sn'den kısa");
    expect(formatElapsed(45)).toBe("45 sn");
    expect(formatElapsed(372)).toBe("6 dk 12 sn");
    expect(formatElapsed(600)).toBe("10 dk");
    expect(formatElapsed(3900)).toBe("1 sa 5 dk");
    expect(formatElapsed(7200)).toBe("2 sa");
    expect(formatElapsed(undefined)).toBeUndefined();
    expect(formatElapsed(Number.NaN)).toBeUndefined();
    expect(formatElapsed(-3)).toBeUndefined();
  });
});

describe("tarih biçimleri (Europe/Istanbul)", () => {
  it("formatDate", () => {
    expect(formatDate("2026-09-30T09:00:00.000Z")).toBe("30 Eyl 2026");
    expect(formatDate("geçersiz")).toBeUndefined();
    expect(formatDate(undefined)).toBeUndefined();
  });

  it("formatDateTime saati İstanbul saatine (UTC+3) çevirir", () => {
    expect(formatDateTime("2026-09-30T09:00:00.000Z")).toBe("30 Eyl 2026 12:00");
  });

  it("toDayKey gün sınırını workspace saat dilimine göre alır", () => {
    // 21:30 UTC = ertesi gün 00:30 İstanbul
    expect(toDayKey("2026-09-30T21:30:00.000Z", "Europe/Istanbul")).toBe("2026-10-01");
    expect(toDayKey("2026-09-30T21:30:00.000Z", "UTC")).toBe("2026-09-30");
  });
});

describe("gün biçimleri (tarih belirteçleri)", () => {
  it("formatDays: 90 → '90 gün'; negatif/ölçülemeyen undefined", async () => {
    const { formatDays } = await import("@/lib/format");
    expect(formatDays(90)).toBe("90 gün");
    expect(formatDays(-1)).toBeUndefined();
    expect(formatDays(undefined)).toBeUndefined();
  });

  it("formatDaysAgo: bugün · dün · N gün önce; negatif/ölçülemeyen undefined", async () => {
    const { formatDaysAgo } = await import("@/lib/format");
    expect([0, 1, 2, 12, 1234].map((n) => formatDaysAgo(n))).toEqual(["bugün", "dün", "2 gün önce", "12 gün önce", "1.234 gün önce"]);
    expect(formatDaysAgo(-2)).toBeUndefined();
    expect(formatDaysAgo(Number.NaN)).toBeUndefined();
  });
});
