import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { AdsProviderError } from "@/lib/ads/provider";
import { currencyMatches, mapAdAccounts, mapDailyMetrics, mapStructure, resultActionOf } from "@/lib/ads/providers/zernio/map";
import { zernioAdAccountsResponseSchema, zernioInsightsResponseSchema, zernioTreeResponseSchema } from "@/lib/ads/providers/zernio/schema";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url), "utf8"));
const insights = () => zernioInsightsResponseSchema.parse(fixture("insights-35d")).data;

describe("Zernio eşleme", () => {
  it("hesap: para birimi hesaptan, birimsiz hesap alınmaz", () => {
    const mapped = mapAdAccounts(zernioAdAccountsResponseSchema.parse(fixture("accounts")).accounts, "z1");
    expect(mapped).toEqual([{ externalAccountId: "act_1000000001", providerAccountId: "z1", label: "Deneme Hesabı", currency: "TRY", status: "active" }]);
    expect(mapAdAccounts([{ adAccountId: "act_2" }], "z1")).toEqual([]);
  });

  it("iki para birimli hesap karışmaz: tutarlar yalnız kendi hesabının satırlarında", () => {
    const accounts = mapAdAccounts([{ adAccountId: "act_1", currency: "try" }, { adAccountId: "act_2", currency: "USD" }], "z");
    expect(accounts.map((a) => a.currency)).toEqual(["TRY", "USD"]);
  });

  it("yapı: kampanya → set → reklam, günlük bütçe yalnız 'daily' tipinden", () => {
    const s = mapStructure(zernioTreeResponseSchema.parse(fixture("tree")).campaigns, "act_1000000001");
    expect(s.campaigns[0]).toMatchObject({ externalId: "c1", status: "active", accountExternalId: "act_1000000001" });
    expect(s.adSets[0]).toMatchObject({ campaignExternalId: "c1", dailyBudget: 150 });
    expect(s.ads[0]).toMatchObject({ externalId: "ad1", adSetExternalId: "s1" });
  });

  it("Meta reklam kimliği (platformAdId) yoksa reklam yazılmaz ve sayılır; Zernio _id'ye düşülmez", () => {
    const campaigns = zernioTreeResponseSchema.parse({
      campaigns: [{ platformCampaignId: "c", adSets: [{ platformAdSetId: "s", ads: [{ _id: "zernio-1", name: "kimliksiz" }, { _id: "zernio-2", platformAdId: "  ", name: "boş" }, { platformAdId: "ad9", name: "tamam" }] }] }],
    }).campaigns;
    const s = mapStructure(campaigns, "act_1");
    expect(s.ads.map((a) => a.externalId)).toEqual(["ad9"]);
    expect(s.dropped).toBe(2);
    expect(mapStructure(zernioTreeResponseSchema.parse(fixture("tree")).campaigns, "act_1").dropped).toBe(0);
  });

  it("kampanya para birimi kayıtlı hesabınkinden farklıysa currency_mismatch (sessiz yanlış birim yok)", () => {
    const campaigns = zernioTreeResponseSchema.parse(fixture("tree")).campaigns;
    expect(() => mapStructure(campaigns, "act_1", "USD")).toThrow(AdsProviderError);
    try {
      mapStructure(campaigns, "act_1", "USD");
    } catch (error) {
      expect((error as AdsProviderError).code).toBe("currency_mismatch");
      expect((error as Error).message).toContain("TRY");
    }
    expect(mapStructure(campaigns, "act_1", "try").campaigns).toHaveLength(1);
    expect(mapStructure(campaigns, "act_1").campaigns).toHaveLength(1);
  });

  it("para birimi: küçük harf aynı sayılır, bildirilmeyen doğrulanamaz ve geçer", () => {
    expect(currencyMatches("try", "TRY")).toBe(true);
    expect(currencyMatches(" TRY ", "try")).toBe(true);
    expect(currencyMatches(undefined, "TRY")).toBe(true);
    expect(currencyMatches("USD", "TRY")).toBe(false);
  });

  it("günlük ölçü: dizge sayılar sayı; eksik alan 0 olmaz", () => {
    const { metrics: rows, dropped } = mapDailyMetrics(insights(), "purchase");
    expect(rows).toHaveLength(35);
    expect(dropped).toBe(0);
    expect(rows[0]).toMatchObject({ adExternalId: "ad1", date: "2026-09-16", spend: 10, impressions: 1000, video3sViews: 400, videoThruplays: 120 });
    expect(rows[3]?.clicks).toBeUndefined();
    expect(rows[0]?.avgWatchSec).toBeUndefined();
  });

  it("sonuç eylemi etiketten seçilir; tanınmayan etiket → sonuç boş", () => {
    expect(resultActionOf("Satın alma")).toBe("purchase");
    expect(resultActionOf("garip etiket!")).toBeUndefined();
    const withLabel = mapDailyMetrics(insights(), resultActionOf("satın alma")).metrics;
    expect(withLabel[2]).toMatchObject({ results: 2, resultValue: 200 });
    const without = mapDailyMetrics(insights(), resultActionOf(undefined)).metrics;
    expect(without.every((r) => r.results === undefined && r.resultValue === undefined)).toBe(true);
  });

  it("eylem listesi hiç yoksa sonuç ölçülemez (0 değil); harcaması olmayan satır alınmaz", () => {
    const rows = zernioInsightsResponseSchema.parse({ data: [{ ad_id: "a", date_start: "2026-10-01", spend: "5", impressions: "10" }, { ad_id: "b", date_start: "2026-10-01" }] }).data;
    const { metrics: mapped, dropped } = mapDailyMetrics(rows, "purchase");
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.results).toBeUndefined();
    expect(dropped, "alınmayan satır sayılır (sessiz düşmez)").toBe(1);
  });
});
