import { describe, expect, it } from "vitest";

import { overviewDescription } from "@/components/overview/header-description";
import type { Briefing } from "@/lib/domain/briefing";
import { formatDateTime } from "@/lib/format";

const NOW = new Date("2026-10-01T20:00:00.000Z");
const briefingAt = (iso: string) => ({ generatedAt: iso }) as Briefing;

describe("overviewDescription", () => {
  it("son bakış zamanını ve notların yaşını yazar", () => {
    const collected = "2026-10-01T15:26:00.000Z";
    expect(overviewDescription({ lastCollectedAt: collected, briefing: briefingAt("2026-10-01T18:00:00.000Z"), now: NOW })).toBe(
      `Hesabına son bakışım: ${formatDateTime(collected)} · notlarım 2 saat önce`,
    );
  });

  it("hiç toplama yoksa 'henüz bakmadım' der (tarih uydurmaz)", () => {
    expect(overviewDescription({ briefing: null, now: NOW })).toBe("Hesabına henüz bakmadım");
  });

  it("notlar yoksa ya da zamanı okunamıyorsa o parça yazılmaz", () => {
    const collected = "2026-10-01T15:26:00.000Z";
    const lead = `Hesabına son bakışım: ${formatDateTime(collected)}`;
    expect(overviewDescription({ lastCollectedAt: collected, briefing: null, now: NOW })).toBe(lead);
    expect(overviewDescription({ lastCollectedAt: collected, briefing: briefingAt("bozuk"), now: NOW })).toBe(lead);
  });
});
