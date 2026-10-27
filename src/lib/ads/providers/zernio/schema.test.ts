import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { zernioAdAccountsResponseSchema, zernioInsightsResponseSchema, zernioTreeResponseSchema } from "@/lib/ads/providers/zernio/schema";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url), "utf8"));

describe("Zernio reklam şemaları (fixture'lar şemadan geçer)", () => {
  it("hesaplar: dolu ve boş", () => {
    expect(zernioAdAccountsResponseSchema.parse(fixture("accounts")).accounts[0]?.adAccountId).toBe("act_1000000001");
    expect(zernioAdAccountsResponseSchema.parse(fixture("accounts-empty")).accounts).toEqual([]);
  });
  it("ağaç: kampanya → set → reklam", () => {
    const tree = zernioTreeResponseSchema.parse(fixture("tree"));
    expect(tree.campaigns[0]?.adSets[0]?.ads[0]?.platformAdId).toBe("ad1");
    expect(zernioTreeResponseSchema.parse(fixture("tree-empty")).campaigns).toEqual([]);
  });
  it("insights: 35 günlük seri; dizge sayılar sayıya, eksik alan undefined (0 değil)", () => {
    const rows = zernioInsightsResponseSchema.parse(fixture("insights-35d")).data;
    expect(rows).toHaveLength(35);
    expect(rows[0]?.spend).toBe(10);
    expect(rows[3]?.clicks).toBeUndefined();
  });
  it("403 gövdesi hesap şemasına dönüşmez (hesap listesi boş kalır)", () => {
    expect(zernioAdAccountsResponseSchema.parse(fixture("error-403")).accounts).toEqual([]);
  });
  it("tek bozuk öğe listeyi boşaltmaz: bozuk öğe düşer ve sayılır (hesap / kampanya / set / reklam / satır)", () => {
    const accounts = zernioAdAccountsResponseSchema.parse({ accounts: [{ adAccountId: "act_1", currency: "TRY" }, "bozuk", { adAccountId: "act_2", currency: "USD" }] });
    expect(accounts.accounts.map((a) => a.adAccountId)).toEqual(["act_1", "act_2"]);
    expect(accounts.dropped).toBe(1);

    const tree = zernioTreeResponseSchema.parse({
      campaigns: [
        { platformCampaignId: "c1", adSets: [{ platformAdSetId: "s1", ads: [{ platformAdId: "a1" }, 7, { platformAdId: "a2" }] }, { adSetName: "kimliksiz" }, null] },
        { campaignName: "kimliksiz kampanya" },
        "bozuk",
        { platformCampaignId: "c2", adSets: "dizi-değil" },
      ],
    });
    expect(tree.campaigns.map((c) => c.platformCampaignId)).toEqual(["c1", "c2"]);
    expect(tree.campaigns[0]?.adSets).toHaveLength(1);
    expect(tree.campaigns[0]?.adSets[0]?.ads.map((a) => a.platformAdId)).toEqual(["a1", "a2"]);
    expect(tree.dropped, "7 + kimliksiz set + null set + kimliksiz kampanya + bozuk kampanya").toBe(5);

    const insights = zernioInsightsResponseSchema.parse({ data: [{ ad_id: "a", date_start: "2026-10-01", spend: "1" }, "bozuk", 5] });
    expect(insights.data).toHaveLength(1);
    expect(insights.dropped).toBe(2);
  });
  it("dizi hiç dizi değilse (hata gövdesi) boş döner, düşen sayılmaz", () => {
    expect(zernioTreeResponseSchema.parse({ error: "x" })).toMatchObject({ campaigns: [], dropped: 0 });
    expect(zernioInsightsResponseSchema.parse({ data: "x" })).toMatchObject({ data: [], dropped: 0 });
  });
});
