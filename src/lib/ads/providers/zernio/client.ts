/**
 * Zernio Ads okuma istemcisi: YALNIZ GET (`/ads/accounts`, `/ads/tree`, `/ads/insights`); `get()` yol izin listesini (`ADS_READ_PATHS`) kendisi zorlar. Yazan uç ve yöntem yok (`no-write.test.ts` tarar).
 * Taban adres ve hata sınıfı `lib/zernio/client.ts`'ten gelir. Hata eşlemesi: 401 → `auth`, 403 → `plan_required`, 404 → `not_found`,
 * 429 → tek bekleme + tek yeniden deneme sonra `rate_limited`, 5xx → `unavailable`. 202 (`backfillPending`) kısa bekleyip bir kez yeniden denenir; ikinci 202 → `unavailable` (gövde veri sayılmaz).
 * Hata iletisi yalnız durum kodu taşır: anahtar ve yanıt gövdesi iletiye girmez.
 */
import "server-only";

import { AdsProviderError, type AdsProviderErrorCode } from "@/lib/ads/provider";
import {
  INSIGHT_FIELDS,
  zernioAdAccountsResponseSchema,
  zernioInsightsResponseSchema,
  zernioTreeResponseSchema,
  type ZernioAdAccount,
  type ZernioInsightRow,
  type ZernioTreeCampaign,
} from "@/lib/ads/providers/zernio/schema";
import { ZERNIO_BASE_URL } from "@/lib/zernio/client";

/** Sayfa tavanı (sonsuz döngü olmasın). */
export const ADS_MAX_PAGES = 20;

export interface ZernioAdsClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface ZernioAdsClient {
  listAdAccounts(zernioAccountId: string): Promise<{ accounts: ZernioAdAccount[]; dropped: number }>;
  listTree(zernioAccountId: string, range: { from: string; to: string }): Promise<{ campaigns: ZernioTreeCampaign[]; dropped: number }>;
  /** Reklam düzeyinde günlük satırlar (`level=ad`, `timeIncrement=1`). */
  listDailyInsights(zernioAccountId: string, adAccountId: string, range: { from: string; to: string }): Promise<{ rows: ZernioInsightRow[]; dropped: number }>;
}
// Her okuma, bozuk öğeyi düşürüp `dropped` olarak sayar (tek bozuk öğe listeyi boşaltmaz).

/** İzin listesi: istemci YALNIZ bu okuma yollarını çağırır; başka yol (yazan uç dahil) çağrılmadan önce fırlatır. */
export const ADS_READ_PATHS: readonly string[] = ["/ads/accounts", "/ads/tree", "/ads/insights"];

export function assertAdsReadPath(path: string): void {
  if (!ADS_READ_PATHS.includes(path)) throw new Error("Zernio reklam istemcisi yalnız okuma yollarına izin verir (izin listesi dışında yol)");
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function codeOf(status: number): AdsProviderErrorCode {
  if (status === 401) return "auth";
  if (status === 403) return "plan_required";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "unavailable";
}

export function createZernioAdsClient(options: ZernioAdsClientOptions): ZernioAdsClient {
  const baseUrl = options.baseUrl ?? ZERNIO_BASE_URL;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  async function get(path: string, query: Record<string, string>): Promise<unknown> {
    assertAdsReadPath(path);
    const url = `${baseUrl}${path}?${new URLSearchParams(query).toString()}`;
    let rateRetried = false;
    let backfillRetried = false;
    for (;;) {
      const res = await doFetch(url, { method: "GET", headers: { Authorization: `Bearer ${options.apiKey}` } });
      if (res.status === 429 && !rateRetried) {
        rateRetried = true;
        const seconds = Number(res.headers.get("retry-after"));
        await sleep(Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds : 5, 60) * 1000);
        continue;
      }
      if (res.status === 202 && !backfillRetried) {
        backfillRetried = true;
        const seconds = Number(res.headers.get("retry-after"));
        await sleep(Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds : 2, 30) * 1000);
        continue;
      }
      // İkinci 202: veri hâlâ hazırlanıyor (`backfillPending`), gövde veri DEĞİL; boş sayılıp yazılmasın.
      if (res.status === 202) throw new AdsProviderError("unavailable", "Zernio reklam verisi hazırlanıyor (202), sonra yeniden denenecek");
      if (res.status !== 200) throw new AdsProviderError(codeOf(res.status), `Zernio reklam isteği başarısız (${res.status})`);
      return res.json();
    }
  }

  return {
    async listAdAccounts(zernioAccountId) {
      return zernioAdAccountsResponseSchema.parse(await get("/ads/accounts", { accountId: zernioAccountId }));
    },
    async listTree(zernioAccountId, range) {
      const campaigns: ZernioTreeCampaign[] = [];
      let dropped = 0;
      for (let page = 1; page <= ADS_MAX_PAGES; page += 1) {
        const parsed = zernioTreeResponseSchema.parse(
          await get("/ads/tree", { accountId: zernioAccountId, fromDate: range.from, toDate: range.to, page: String(page) }),
        );
        campaigns.push(...parsed.campaigns);
        dropped += parsed.dropped;
        if (page >= (parsed.pagination?.pages ?? 1)) break;
      }
      return { campaigns, dropped };
    },
    async listDailyInsights(zernioAccountId, adAccountId, range) {
      const rows: ZernioInsightRow[] = [];
      let dropped = 0;
      let after: string | undefined;
      for (let page = 1; page <= ADS_MAX_PAGES; page += 1) {
        const query: Record<string, string> = {
          accountId: zernioAccountId,
          objectId: adAccountId,
          level: "ad",
          timeIncrement: "1",
          fromDate: range.from,
          toDate: range.to,
          fields: INSIGHT_FIELDS,
          limit: "500",
        };
        if (after) query.after = after;
        const parsed = zernioInsightsResponseSchema.parse(await get("/ads/insights", query));
        rows.push(...parsed.data);
        dropped += parsed.dropped;
        after = parsed.paging?.after ?? undefined;
        if (!after) break;
      }
      return { rows, dropped };
    },
  };
}
