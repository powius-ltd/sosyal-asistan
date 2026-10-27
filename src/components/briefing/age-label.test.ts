import { describe, expect, it } from "vitest";

import { briefingAgeLabel } from "@/components/briefing/age-label";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("briefingAgeLabel", () => {
  it("dakika, saat ve gün olarak yazar", () => {
    expect(briefingAgeLabel(ago(10_000), NOW)).toBe("az önce");
    expect(briefingAgeLabel(ago(5 * 60_000), NOW)).toBe("5 dakika önce");
    expect(briefingAgeLabel(ago(3 * 3_600_000), NOW)).toBe("3 saat önce");
    expect(briefingAgeLabel(ago(50 * 3_600_000), NOW)).toBe("2 gün önce");
  });

  it("gelecekteki anı az önce sayar, okunamayan zamanı bilinmeyen bırakır", () => {
    expect(briefingAgeLabel(ago(-60_000), NOW)).toBe("az önce");
    expect(briefingAgeLabel("bozuk", NOW)).toBeUndefined();
  });
});
