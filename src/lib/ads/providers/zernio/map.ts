/**
 * Zernio yanıtı → sağlayıcı tipleri (`lib/ads/provider.ts`). Saf işlevler.
 * Kurallar: para birimi HESAPTAN gelir (tutarlar ana birimde, dönüşüm yok; iki hesap karışmaz); olmayan alan `undefined` (0 değil);
 * sonuç eylemi hesabın sonuç etiketinden seçilir, etiket tanınmıyorsa `results`/`resultValue` BOŞ kalır.
 * [V] Meta eylem listesi sıfır değerli eylemi hiç yazmaz: liste dolu ama sonuç eylemi yoksa sonuç 0'dır; liste hiç yoksa ölçülemez.
 */
import { AdsProviderError } from "@/lib/ads/provider";
import type { AdAccountStatus, AdEntityStatus } from "@/lib/domain/ads";
import type { ProviderAd, ProviderAdAccount, ProviderAdSet, ProviderCampaign, ProviderDailyMetric, ProviderMetrics, ProviderStructure } from "@/lib/ads/provider";
import type { ZernioActionList, ZernioAdAccount, ZernioInsightRow, ZernioTreeCampaign } from "@/lib/ads/providers/zernio/schema";

/** Hesabın sonuç etiketi (serbest metin) → Meta `action_type`. Etiketin kendisi bir `action_type` ise olduğu gibi geçer. */
const RESULT_ACTIONS: Readonly<Record<string, string>> = {
  "satın alma": "purchase",
  satis: "purchase",
  satış: "purchase",
  purchase: "purchase",
  form: "lead",
  lead: "lead",
  "potansiyel müşteri": "lead",
  kayıt: "complete_registration",
  "kayıt olma": "complete_registration",
  tıklama: "link_click",
  "bağlantı tıklaması": "link_click",
  mesaj: "onsite_conversion.messaging_conversation_started_7d",
};

export function resultActionOf(resultLabel: string | undefined): string | undefined {
  const label = resultLabel?.trim().toLowerCase();
  if (!label) return undefined;
  if (RESULT_ACTIONS[label]) return RESULT_ACTIONS[label];
  return /^[a-z0-9_.]+$/.test(label) ? label : undefined;
}

export function mapAccountStatus(raw: string | null | undefined): AdAccountStatus {
  const value = raw?.trim().toLowerCase();
  if (value === "active" || value === "1") return "active";
  if (value === "disabled" || value === "2") return "disabled";
  return "unknown";
}

export function mapEntityStatus(raw: string | null | undefined): AdEntityStatus {
  const value = raw?.trim().toLowerCase() ?? "";
  if (value === "active") return "active";
  if (value.includes("paused")) return "paused";
  if (value === "archived" || value === "deleted") return "archived";
  return "unknown";
}

/** Para birimi yoksa hesap alınmaz: birimsiz tutar yazılmaz. */
export function mapAdAccounts(accounts: readonly ZernioAdAccount[], zernioAccountId: string): ProviderAdAccount[] {
  const result: ProviderAdAccount[] = [];
  for (const account of accounts) {
    const externalAccountId = account.adAccountId ?? account.id;
    const currency = account.currency?.trim().toUpperCase();
    if (!externalAccountId || !currency) continue;
    result.push({
      externalAccountId,
      providerAccountId: zernioAccountId,
      label: account.name ?? undefined,
      currency,
      status: mapAccountStatus(account.status ?? account.accountStatus),
    });
  }
  return result;
}

/** Para birimi karşılaştırması büyük/küçük harfe bakmaz; kayıtlı birim (`ad_accounts.currency`) esastır. */
export function currencyMatches(read: string | null | undefined, expected: string): boolean {
  const value = read?.trim().toUpperCase();
  return value === undefined || value === "" || value === expected.trim().toUpperCase();
}

/**
 * `expectedCurrency`: kayıtlı hesabın para birimi. Kampanya başka birim bildiriyorsa `currency_mismatch` fırlar (sessiz yanlış birim yok);
 * kampanya birim bildirmiyorsa doğrulanamaz ve geçer [V]. Zernio ağacı Zernio hesabına göre gelir (reklam hesabına göre süzme belgede yok),
 * bu yüzden aynı Zernio hesabındaki başka birimli reklam hesabı da burada yakalanır.
 */
export function mapStructure(campaigns: readonly ZernioTreeCampaign[], accountExternalId: string, expectedCurrency?: string): ProviderStructure {
  const out: ProviderStructure = { campaigns: [], adSets: [], ads: [], creatives: [], dropped: 0 };
  for (const campaign of campaigns) {
    if (expectedCurrency !== undefined && !currencyMatches(campaign.currency, expectedCurrency)) {
      throw new AdsProviderError("currency_mismatch", `Kampanya ${campaign.platformCampaignId} para birimi ${campaign.currency?.trim().toUpperCase()}, kayıtlı hesap ${expectedCurrency.toUpperCase()}`);
    }
    const mapped: ProviderCampaign = {
      accountExternalId,
      externalId: campaign.platformCampaignId,
      name: campaign.campaignName ?? campaign.platformCampaignId,
      status: mapEntityStatus(campaign.platformCampaignStatus ?? campaign.status),
    };
    out.campaigns.push(mapped);
    for (const set of campaign.adSets) {
      const budget = set.adSetBudget;
      const adSet: ProviderAdSet = {
        campaignExternalId: campaign.platformCampaignId,
        externalId: set.platformAdSetId,
        name: set.adSetName ?? set.platformAdSetId,
        status: mapEntityStatus(set.status),
        dailyBudget: budget && budget.amount !== undefined && budget.type?.toLowerCase().includes("daily") ? budget.amount : undefined,
      };
      out.adSets.push(adSet);
      for (const ad of set.ads) {
        // Meta reklam kimliği yoksa reklam yazılmaz (Zernio `_id` Meta kimliği DEĞİLDİR: ölçü satırlarıyla eşleşmez) ve sayılır.
        const externalId = ad.platformAdId?.trim();
        if (!externalId) {
          out.dropped += 1;
          continue;
        }
        const mappedAd: ProviderAd = {
          adSetExternalId: set.platformAdSetId,
          externalId,
          name: ad.name ?? externalId,
          status: mapEntityStatus(ad.configuredStatus ?? ad.status),
        };
        out.ads.push(mappedAd);
      }
    }
  }
  return out;
}

function sumActions(list: ZernioActionList, only?: string): number | undefined {
  if (!list || list.length === 0) return undefined;
  let total: number | undefined;
  for (const item of list) {
    if (only !== undefined && item.action_type !== only) continue;
    if (item.value !== undefined) total = (total ?? 0) + item.value;
  }
  return total;
}

/** Sonuç eylemi: liste dolu ama eylem yoksa 0 [V]; liste yoksa ya da eylem bilinmiyorsa undefined. */
function resultOf(list: ZernioActionList, action: string | undefined): number | undefined {
  if (action === undefined || !list || list.length === 0) return undefined;
  return sumActions(list, action) ?? 0;
}

/** Reklam, gün, harcama ya da gösterimi olmayan satır alınmaz ama SAYILIR (`dropped`). */
export function mapDailyMetrics(rows: readonly ZernioInsightRow[], resultAction: string | undefined): ProviderMetrics {
  const out: ProviderDailyMetric[] = [];
  let dropped = 0;
  for (const row of rows) {
    if (!row.ad_id || !row.date_start || row.spend === undefined || row.impressions === undefined) {
      dropped += 1;
      continue;
    }
    out.push({
      adExternalId: row.ad_id,
      date: row.date_start.slice(0, 10),
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      results: resultOf(row.actions, resultAction),
      resultValue: resultOf(row.action_values, resultAction),
      frequency: row.frequency,
      reach: row.reach,
      video3sViews: sumActions(row.video_3_sec_watched_actions),
      videoThruplays: sumActions(row.video_thruplay_watched_actions),
      avgWatchSec: sumActions(row.video_avg_time_watched_actions),
    });
  }
  return { metrics: out, dropped };
}
