import { describe, expect, it } from "vitest";

import { formatDigestPeriod, formatSigned } from "@/components/notifications/digest-format";

describe("formatSigned", () => {
  it("artı/eksi işaretini yazar; sıfır işaretsizdir", () => {
    expect(formatSigned(1234)).toBe("+1.234");
    expect(formatSigned(-56)).toBe("−56");
    expect(formatSigned(0)).toBe("0");
  });

  it("ölçülemeyen girdi undefined (0 uydurulmaz)", () => {
    expect(formatSigned(undefined)).toBeUndefined();
    expect(formatSigned(null)).toBeUndefined();
    expect(formatSigned(Number.NaN)).toBeUndefined();
  });
});

describe("formatDigestPeriod", () => {
  it("dönem tarihlerini workspace saat diliminde yazar", () => {
    // 23:30Z Istanbul'da ertesi gündür: gün sınırı UTC değil workspace tz'sine göre.
    expect(formatDigestPeriod("2026-09-22T23:30:00.000Z", "2026-09-29T23:30:00.000Z", "Europe/Istanbul")).toBe("23 Eyl 2026 – 30 Eyl 2026");
  });

  it("geçersiz tarihte undefined", () => {
    expect(formatDigestPeriod("bozuk", "2026-09-29T23:30:00.000Z", "Europe/Istanbul")).toBeUndefined();
  });
});
