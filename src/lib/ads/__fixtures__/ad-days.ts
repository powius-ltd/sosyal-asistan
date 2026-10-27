/** Kabul testleri için günlük reklam serisi kurucuları (deterministik; kimlik / marka adı yok). */
import { shiftDay } from "@/lib/ads/days";
import type { AdDataset } from "@/lib/data/views/ads";
import type { AdAccount, AdDailyMetric, AdGoal } from "@/lib/domain/ads";

/** Testlerin "bugün"ü (açık, yarım gün: karara girmez). Seriler dünde biter; 28 kapanmış gün = 29 günlük dönem 2026-09-22 .. 2026-10-20. */
export const NOW = new Date("2026-10-20T09:00:00Z");
export const NOW_DAY = "2026-10-20";

export const VALUE_GOAL: AdGoal = { kind: "value", resultLabel: "satın alma", targetReturn: 3, grossMargin: 0.5 };

export interface DaySpec {
  spend?: number;
  impressions?: number;
  clicks?: number;
  results?: number;
  resultValue?: number;
  frequency?: number;
}

/** Bir reklamın son `days` KAPANMIŞ günü (dün biter); `at(i, last)` i. günün (0 = ilk) alanlarını ezer. */
export function adDays(adId: string, days: number, base: DaySpec, at?: (i: number, last: number) => DaySpec): AdDailyMetric[] {
  return Array.from({ length: days }, (_, i) => {
    const spec = { spend: 100, impressions: 1000, clicks: 20, results: 5, frequency: 1.2, ...base, ...at?.(i, days - 1) };
    return { adId, date: shiftDay(NOW_DAY, -(days - i)), ...spec } as AdDailyMetric;
  });
}

export const accountOf = (goal: AdGoal | undefined): AdAccount => ({
  id: "acc", workspaceId: "w", provider: "zernio", externalAccountId: "act_1", currency: "TRY", status: "active", ...(goal === undefined ? {} : { goal }),
});

/** `ads`: ad kimliği → başlangıç gün sayısı (yayına girişten bugüne). Tek hesap, tek kampanya, tek set. */
export function datasetOf(account: AdAccount, ads: Record<string, { liveDays: number; rows: AdDailyMetric[] }>): AdDataset {
  return {
    accounts: [account],
    campaigns: [{ id: "c", accountId: account.id, externalId: "c", name: "Kampanya", status: "active" }],
    adSets: [{ id: "s", campaignId: "c", externalId: "s", name: "Set", status: "active" }],
    ads: Object.entries(ads).map(([id, spec]) => ({ id, adSetId: "s", externalId: id, name: id, status: "active" as const, startedOn: shiftDay(NOW_DAY, -(spec.liveDays - 1)) })),
    creatives: [],
    metrics: Object.values(ads).flatMap((spec) => spec.rows),
  };
}
