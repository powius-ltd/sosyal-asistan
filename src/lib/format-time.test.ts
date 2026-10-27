import { describe, expect, it } from "vitest";

import { formatDayMonth, formatTime, formatWeekdayTime, timeZoneLabel } from "@/lib/format";

// 2026-10-08 (Perşembe) 23:00 UTC = New York 19:00 (EDT, UTC-4) = İstanbul 02:00 (Cuma, UTC+3)
const AT = "2026-10-08T23:00:00.000Z";

describe("saat dilimli gösterim", () => {
  it("aynı anı iki dilimde gösterir; gün adı dilime göre değişir", () => {
    expect(formatTime(AT, "America/New_York")).toBe("19:00");
    expect(formatTime(AT, "Europe/Istanbul")).toBe("02:00");
    expect(formatWeekdayTime(AT, "America/New_York")).toBe("Per 19:00");
    expect(formatWeekdayTime(AT, "Europe/Istanbul")).toBe("Cum 02:00");
  });

  it("gece yarısı 24:00 değil 00:00 yazılır", () => {
    expect(formatTime("2026-10-08T04:00:00.000Z", "America/New_York")).toBe("00:00");
  });

  it("gün-ay yıl olmadan; ölçülemeyen girdi undefined (uydurma değer yok)", () => {
    expect(formatDayMonth("2026-10-05", "UTC")).toBe("5 Eki");
    expect(formatTime(undefined)).toBeUndefined();
    expect(formatWeekdayTime("geçersiz")).toBeUndefined();
    expect(formatDayMonth(null)).toBeUndefined();
  });

  it("dilim adı: bilinen kısaltma, bilinmeyen IANA adıyla", () => {
    expect(timeZoneLabel("America/New_York")).toBe("ET");
    expect(timeZoneLabel("Europe/Istanbul")).toBe("İstanbul");
    expect(timeZoneLabel("Asia/Tokyo")).toBe("Asia/Tokyo");
  });
});
