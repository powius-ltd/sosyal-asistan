/**
 * Zernio Ads API yanıt şemaları (YALNIZ OKUMA uçları). Yalnız kullanılan alanlar okunur; hedef kitle, yorumcu, lead formu alanı hiç ayrıştırılmaz.
 * Kaynaklar (docs.zernio.com, okundu 2026-10-21):
 *  - T: Kampanyalar sayfası (meta-ads altı) → GET /v1/ads/tree
 *  - I: /platforms/meta-ads/analytics   → GET /v1/ads/insights (Meta ham satırları; sayılar DİZGE gelir)
 *  - O: /platforms/meta-ads/operational-reads (hesap uçları; `GET /v1/ads/accounts` BELGEDE YOK)
 * `[V]` = belgede yok, varsayım (ilk gerçek okumada doğrulanır). Ölçülemeyen/bozuk alan `undefined` olur (0 değil), satır düşmez.
 */
import { z } from "zod";

/** Sayı ya da sayı dizgesi → sayı; boş/bozuk → undefined. */
const num = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return undefined;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  })
  .catch(undefined);

const str = z.string().nullish().catch(undefined);

/**
 * Dizi, ÖĞE ÖĞE okunur: bozuk öğe düşer ve SAYILIR (`dropped`); tek bozuk öğe tüm listeyi boşaltmaz. Dizi hiç dizi değilse (ör. hata gövdesi)
 * liste boş döner, düşen sayılmaz (yanıt zaten veri taşımıyor; durum kodu hatayı söyler).
 */
export function splitItems<T extends z.ZodType>(raw: unknown, item: T): { items: z.output<T>[]; dropped: number } {
  const items: z.output<T>[] = [];
  let dropped = 0;
  if (!Array.isArray(raw)) return { items, dropped };
  for (const entry of raw) {
    const parsed = item.safeParse(entry);
    if (parsed.success) items.push(parsed.data);
    else dropped += 1;
  }
  return { items, dropped };
}
const rawList = z.unknown().optional();

/** Meta eylem listesi: `[{ action_type, value }]` (I). */
export const zernioActionListSchema = z
  .array(z.object({ action_type: str, value: num }))
  .nullish()
  .catch(undefined);
export type ZernioActionList = z.infer<typeof zernioActionListSchema>;

// ------------------------------------------------------------- GET /v1/ads/accounts [V]
/** [V] Uç belgede yok; 21 Eki denemesinde `accountId` (Zernio sosyal hesap kimliği) zorunlu çıktı. Alan adları varsayım. */
export const zernioAdAccountSchema = z.object({
  adAccountId: str,
  id: str,
  name: str,
  currency: str,
  status: str,
  accountStatus: str,
});
export type ZernioAdAccount = z.infer<typeof zernioAdAccountSchema>;

export const zernioAdAccountsResponseSchema = z
  .object({ accounts: rawList })
  .transform(({ accounts }) => {
    const { items, dropped } = splitItems(accounts, zernioAdAccountSchema);
    return { accounts: items, dropped };
  });

// ------------------------------------------------------------- GET /v1/ads/tree (T)
const budgetSchema = z.object({ amount: num, type: str }).nullish().catch(undefined);

const treeMetricsSchema = z.object({
  spend: num,
  impressions: num,
  clicks: num,
  roas: num,
});

export const zernioTreeAdSchema = z.object({
  /** Zernio'nun kendi kaydı; eşlemede KULLANILMAZ (ölçü satırları Meta kimliğiyle gelir). */
  _id: str,
  /** [V] Meta reklam kimliği; belgede adı geçmiyor (`search` "platform ad id" kabul eder). Yoksa reklam yazılmaz (`_id` Meta kimliği değildir). */
  platformAdId: str,
  name: str,
  status: str,
  configuredStatus: str,
});

const treeAdSetBase = z.object({
  platformAdSetId: z.string(),
  adSetName: str,
  status: str,
  adSetBudget: budgetSchema,
});

const treeCampaignBase = z.object({
  platformCampaignId: z.string(),
  campaignName: str,
  status: str,
  platformCampaignStatus: str,
  /** Hesabın para birimi (ISO 4217). */
  currency: str,
  campaignBudget: budgetSchema,
  metrics: treeMetricsSchema.nullish().catch(undefined),
});

export type ZernioTreeAd = z.infer<typeof zernioTreeAdSchema>;
export type ZernioTreeAdSet = z.infer<typeof treeAdSetBase> & { ads: ZernioTreeAd[] };
export type ZernioTreeCampaign = z.infer<typeof treeCampaignBase> & { adSets: ZernioTreeAdSet[] };

/** Alt dizisini ayrıca okumak için: nesne olduğu bilinen öğenin ham alt alanı. */
const asObject = z.object({}).passthrough();
const child = (entry: Record<string, unknown>, key: string): unknown => entry[key];

/** Kampanya → set → reklam, her düzeyde öğe öğe; düşen sayısı (iç içe dahil) döner. */
function parseCampaigns(raw: unknown): { campaigns: ZernioTreeCampaign[]; dropped: number } {
  const campaigns: ZernioTreeCampaign[] = [];
  let dropped = 0;
  const top = splitItems(raw, asObject);
  dropped += top.dropped;
  for (const entry of top.items) {
    const base = treeCampaignBase.safeParse(entry);
    if (!base.success) {
      dropped += 1;
      continue;
    }
    const adSets: ZernioTreeAdSet[] = [];
    const sets = splitItems(child(entry, "adSets"), asObject);
    dropped += sets.dropped;
    for (const setEntry of sets.items) {
      const setBase = treeAdSetBase.safeParse(setEntry);
      if (!setBase.success) {
        dropped += 1;
        continue;
      }
      const ads = splitItems(child(setEntry, "ads"), zernioTreeAdSchema);
      dropped += ads.dropped;
      adSets.push({ ...setBase.data, ads: ads.items });
    }
    campaigns.push({ ...base.data, adSets });
  }
  return { campaigns, dropped };
}

export const zernioTreeResponseSchema = z
  .object({
    campaigns: rawList,
    pagination: z.object({ page: num, pages: num }).nullish().catch(undefined),
    backfillPending: z.boolean().nullish().catch(undefined),
  })
  .transform((body) => ({ ...body, ...parseCampaigns(body.campaigns) }));
export type ZernioTreeResponse = z.infer<typeof zernioTreeResponseSchema>;

// ------------------------------------------------------------- GET /v1/ads/insights (I)
/** `level=ad&timeIncrement=1` satırı: Meta ham alanları. `date_start` günün tarihi [V: Meta davranışı]. */
export const zernioInsightRowSchema = z.object({
  ad_id: str,
  date_start: str,
  spend: num,
  impressions: num,
  clicks: num,
  reach: num,
  frequency: num,
  actions: zernioActionListSchema,
  action_values: zernioActionListSchema,
  video_3_sec_watched_actions: zernioActionListSchema,
  video_thruplay_watched_actions: zernioActionListSchema,
  video_avg_time_watched_actions: zernioActionListSchema,
});
export type ZernioInsightRow = z.infer<typeof zernioInsightRowSchema>;

export const zernioInsightsResponseSchema = z
  .object({
    objectId: str,
    data: rawList,
    paging: z.object({ after: str }).nullish().catch(undefined),
  })
  .transform((body) => {
    const { items, dropped } = splitItems(body.data, zernioInsightRowSchema);
    return { ...body, data: items, dropped };
  });
export type ZernioInsightsResponse = z.infer<typeof zernioInsightsResponseSchema>;

/** Insights'a gönderilen Meta alan listesi (kişi verisi içermez). */
export const INSIGHT_FIELDS = [
  "ad_id",
  "spend",
  "impressions",
  "clicks",
  "reach",
  "frequency",
  "actions",
  "action_values",
  "video_3_sec_watched_actions",
  "video_thruplay_watched_actions",
  "video_avg_time_watched_actions",
].join(",");
