import { describe, expect, it } from "vitest";

import type { ProviderDailyMetric } from "@/lib/ads/provider";
import { markAdsStartedOn, startedOnByAd } from "@/lib/ads/sync-store";
import type { AdminClient } from "@/lib/supabase/admin";

const m = (adExternalId: string, date: string): ProviderDailyMetric => ({ adExternalId, date, spend: 1, impressions: 1 });
const FROM = "2026-09-17";

describe("reklam başlangıç günü (Zernio başlangıç tarihi vermez)", () => {
  it("ilk ölçü günü pencerenin İÇİNDE başlıyorsa başlangıçtır; pencere başındaysa bilinmez", () => {
    const map = startedOnByAd([m("yeni", "2026-10-05"), m("yeni", "2026-10-03"), m("eski", FROM), m("eski", "2026-10-01"), m("sınırda", "2026-09-18")], FROM);
    expect(Object.fromEntries(map)).toEqual({ yeni: "2026-10-03", sınırda: "2026-09-18" });
    expect(startedOnByAd([], FROM).size).toBe(0);
  });

  it("aynı güne düşen reklamlar tek güncellemede, yalnız boş ya da daha geç tarihe yazılır", async () => {
    const calls: Array<{ patch: unknown; ids: string[]; or: string }> = [];
    const db = {
      from: (table: string) => {
        expect(table).toBe("ads");
        return {
          update: (patch: unknown) => ({
            in: (_col: string, ids: string[]) => ({
              or: async (or: string) => {
                calls.push({ patch, ids, or });
                return { error: null };
              },
            }),
          }),
        };
      },
    } as unknown as AdminClient;
    const adIds = new Map([["a", "id-a"], ["b", "id-b"], ["c", "id-c"], ["eski", "id-eski"]]);
    const metrics = [m("a", "2026-10-03"), m("b", "2026-10-03"), m("c", "2026-10-10"), m("eski", FROM), m("yok", "2026-10-04")];
    expect(await markAdsStartedOn(db, adIds, metrics, FROM)).toBe(3);
    expect(calls).toEqual([
      { patch: { started_on: "2026-10-03" }, ids: ["id-a", "id-b"], or: "started_on.is.null,started_on.gt.2026-10-03" },
      { patch: { started_on: "2026-10-10" }, ids: ["id-c"], or: "started_on.is.null,started_on.gt.2026-10-10" },
    ]);
  });

  it("DB hatası yutulmaz", async () => {
    const db = { from: () => ({ update: () => ({ in: () => ({ or: async () => ({ error: { message: "x" } }) }) }) }) } as unknown as AdminClient;
    await expect(markAdsStartedOn(db, new Map([["a", "id"]]), [m("a", "2026-10-03")], FROM)).rejects.toThrow(/ads/);
  });
});
