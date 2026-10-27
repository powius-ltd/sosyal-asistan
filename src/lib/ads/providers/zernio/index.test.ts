import { describe, expect, it } from "vitest";

import { AdsProviderError } from "@/lib/ads/provider";
import { createZernioAdsProvider } from "@/lib/ads/providers/zernio";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const range = { from: "2026-10-01", to: "2026-10-02" };

describe("Zernio sağlayıcısı: düşen öğeler yukarı taşınır", () => {
  it("yapı: istemcide düşen + eşlemede düşen (kimliksiz reklam) toplanır", async () => {
    const tree = { campaigns: [{ platformCampaignId: "c", adSets: [{ platformAdSetId: "s", ads: [{ platformAdId: "a1" }, { _id: "yalnız-zernio" }, 3] }] }] };
    const provider = createZernioAdsProvider({ apiKey: "k", zernioAccountId: "z", structureRange: range, fetchImpl: async () => json(tree) });
    const structure = await provider.listStructure("act_1");
    expect(structure.ads.map((a) => a.externalId)).toEqual(["a1"]);
    expect(structure.dropped).toBe(2);
  });

  it("ölçü: bozuk satır + harcamasız satır sayılır", async () => {
    const data = [{ ad_id: "a", date_start: "2026-10-01", spend: "2", impressions: "5" }, "bozuk", { ad_id: "b", date_start: "2026-10-01" }];
    const provider = createZernioAdsProvider({ apiKey: "k", zernioAccountId: "z", structureRange: range, fetchImpl: async () => json({ data }) });
    const read = await provider.dailyMetrics("act_1", range);
    expect(read.metrics).toHaveLength(1);
    expect(read.dropped).toBe(2);
  });

  it("kayıtlı para birimi ağaçtakinden farklıysa okuma currency_mismatch ile durur", async () => {
    const tree = { campaigns: [{ platformCampaignId: "c", currency: "EUR", adSets: [] }] };
    const provider = createZernioAdsProvider({ apiKey: "k", zernioAccountId: "z", currency: "TRY", structureRange: range, fetchImpl: async () => json(tree) });
    const error = await provider.listStructure("act_1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdsProviderError);
    expect((error as AdsProviderError).code).toBe("currency_mismatch");
  });
});
