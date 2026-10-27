/** Zernio `AdsProvider` uygulaması (YALNIZ OKUMA). Yalnız sunucu işçisi (`ads_sync`) ve betik içe aktarır. */
import "server-only";

import type { AdsProvider } from "@/lib/ads/provider";
import { createZernioAdsClient, type ZernioAdsClientOptions } from "@/lib/ads/providers/zernio/client";
import { mapAdAccounts, mapDailyMetrics, mapStructure, resultActionOf } from "@/lib/ads/providers/zernio/map";

export interface ZernioAdsProviderOptions extends ZernioAdsClientOptions {
  /** Zernio'daki bağlı Meta hesabının kimliği (`GET /accounts`). */
  zernioAccountId: string;
  /** Kayıtlı hesabın para birimi (`ad_accounts.currency`); ağaçtaki kampanya başka birim bildirirse okuma durur. */
  currency?: string;
  /** Hesabın sonuç etiketi ("satın alma"); yoksa sonuç ölçüleri boş kalır. */
  resultLabel?: string;
  /** Yapı okumasının tarih aralığı (ağaç ölçüleri bu aralıktandır; yapı için kullanılır). */
  structureRange: { from: string; to: string };
}

export function createZernioAdsProvider(options: ZernioAdsProviderOptions): AdsProvider {
  const client = createZernioAdsClient(options);
  const resultAction = resultActionOf(options.resultLabel);
  return {
    async listAccounts() {
      return mapAdAccounts((await client.listAdAccounts(options.zernioAccountId)).accounts, options.zernioAccountId);
    },
    async listStructure(externalAccountId) {
      const tree = await client.listTree(options.zernioAccountId, options.structureRange);
      const structure = mapStructure(tree.campaigns, externalAccountId, options.currency);
      return { ...structure, dropped: structure.dropped + tree.dropped };
    },
    async dailyMetrics(externalAccountId, query) {
      const read = await client.listDailyInsights(options.zernioAccountId, externalAccountId, query);
      const mapped = mapDailyMetrics(read.rows, resultAction);
      return { ...mapped, dropped: mapped.dropped + read.dropped };
    },
  };
}
