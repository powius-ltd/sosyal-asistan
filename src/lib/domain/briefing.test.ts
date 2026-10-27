import { describe, expect, it } from "vitest";

import { BRIEFING_COMMAND_IDS, BRIEFING_COMMANDS, BRIEFING_STALE_DAYS, briefingFreshness, latestSuccessfulCollectionAt } from "@/lib/domain/briefing";
import { DAY_MS } from "@/lib/time";

const NOW = new Date("2026-10-01T09:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("briefingFreshness (bayatlık kuralı)", () => {
  it("taze: yakın zamanda üretildi ve sonrasında toplama yok", () => {
    expect(briefingFreshness(ago(3_600_000), { now: NOW })).toEqual({ stale: false });
    expect(briefingFreshness(ago(3_600_000), { now: NOW, lastCollectedAt: ago(2 * 3_600_000) })).toEqual({ stale: false });
  });

  it("bayat: brifingten SONRA yeni toplama geldi", () => {
    expect(briefingFreshness(ago(2 * 3_600_000), { now: NOW, lastCollectedAt: ago(3_600_000) })).toEqual({ stale: true, reason: "new_data" });
  });

  it("toplama brifingle aynı anda ya da öncesinde → bayat değil (eşitlik taze)", () => {
    const at = ago(3_600_000);
    expect(briefingFreshness(at, { now: NOW, lastCollectedAt: at })).toEqual({ stale: false });
  });

  it("bayat: 8 günden eski; tam 8 gün bayat değil, üstü bayat", () => {
    expect(BRIEFING_STALE_DAYS).toBe(8);
    expect(briefingFreshness(ago(8 * DAY_MS), { now: NOW })).toEqual({ stale: false });
    expect(briefingFreshness(ago(8 * DAY_MS + 1), { now: NOW })).toEqual({ stale: true, reason: "too_old" });
  });

  it("iki sebep birlikte → new_data önce", () => {
    expect(briefingFreshness(ago(20 * DAY_MS), { now: NOW, lastCollectedAt: ago(DAY_MS) })).toEqual({ stale: true, reason: "new_data" });
  });

  it("bilinmeyen toplama anı bayatlık sebebi sayılmaz (yalnız yaş kuralı); okunamayan zaman → bayat", () => {
    expect(briefingFreshness(ago(DAY_MS), { now: NOW, lastCollectedAt: undefined })).toEqual({ stale: false });
    expect(briefingFreshness(ago(DAY_MS), { now: NOW, lastCollectedAt: "bozuk" })).toEqual({ stale: false });
    expect(briefingFreshness("bozuk", { now: NOW })).toEqual({ stale: true, reason: "too_old" });
  });
});

describe("latestSuccessfulCollectionAt", () => {
  const run = (over: Partial<{ provider: string; status: string; startedAt: string; finishedAt?: string }>) => ({
    provider: "apify" as const,
    status: "ingested" as const,
    startedAt: "2026-09-20T10:00:00.000Z",
    finishedAt: "2026-09-20T10:05:00.000Z",
    ...over,
  });

  it("yalnız Apify + ingested; en yeni bitiş (bitiş yoksa başlangıç)", () => {
    const runs = [
      run({}),
      run({ finishedAt: "2026-09-25T10:05:00.000Z" }),
      run({ status: "failed", finishedAt: "2026-09-29T10:00:00.000Z" }),
      run({ provider: "claude_cli", finishedAt: "2026-09-30T10:00:00.000Z" }),
      run({ startedAt: "2026-09-26T08:00:00.000Z", finishedAt: undefined }),
    ] as Parameters<typeof latestSuccessfulCollectionAt>[0];
    expect(latestSuccessfulCollectionAt(runs)).toBe("2026-09-26T08:00:00.000Z");
  });

  it("başarılı toplama yoksa undefined (0/sahte tarih değil)", () => {
    expect(latestSuccessfulCollectionAt([])).toBeUndefined();
    expect(latestSuccessfulCollectionAt([run({ status: "aborted" })] as Parameters<typeof latestSuccessfulCollectionAt>[0])).toBeUndefined();
  });
});

describe("BRIEFING_COMMANDS (komut tablosu)", () => {
  it("her kimlik için komut var; yalnız Apify harcayanlar paralı (collect, measure)", () => {
    const paid = BRIEFING_COMMAND_IDS.filter((id) => BRIEFING_COMMANDS[id].spendsMoney);
    expect(paid).toEqual(["collect", "measure"]);
    for (const id of BRIEFING_COMMAND_IDS) expect(BRIEFING_COMMANDS[id].script).toMatch(/^[a-z:]+$/);
  });
});
