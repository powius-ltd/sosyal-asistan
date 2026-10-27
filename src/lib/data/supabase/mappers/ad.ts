/**
 * Reklam satırları → domain (`domain/ads.ts`). DB `NULL` = domain `undefined` (ölçülemedi ≠ 0); `numeric`/`bigint` PostgREST'ten JSON
 * sayı gelir. Bilinmeyen sütun değeri (CHECK dışı) `unknown` durumuna düşer: okuma tek bozuk satır yüzünden düşmez.
 */
import type { Ad, AdAccount, AdAccountStatus, AdCampaign, AdCreative, AdDailyMetric, AdEntityStatus, AdFormat, AdGoal, AdSet } from "@/lib/domain/ads";
import { AD_ACCOUNT_STATUSES, AD_ENTITY_STATUSES, AD_FORMATS } from "@/lib/domain/ads";
import type { Tables } from "@/lib/supabase/database.types";
import { opt } from "@/lib/data/supabase/mappers/common";

const oneOf = <T extends string>(list: readonly T[], value: string, fallback: T): T => (list as readonly string[]).includes(value) ? (value as T) : fallback;

const goalOf = (row: Tables<"ad_accounts">): AdGoal | undefined => {
  if ((row.goal_kind !== "value" && row.goal_kind !== "cost") || row.result_label === null) return undefined;
  return {
    kind: row.goal_kind,
    resultLabel: row.result_label,
    ...(row.target_return === null ? {} : { targetReturn: row.target_return }),
    ...(row.gross_margin === null ? {} : { grossMargin: row.gross_margin }),
    ...(row.target_cost_per_result === null ? {} : { targetCostPerResult: row.target_cost_per_result }),
  };
};

export function toAdAccount(row: Tables<"ad_accounts">): AdAccount {
  const goal = goalOf(row);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: "zernio",
    externalAccountId: row.external_account_id,
    ...(row.provider_account_id === null ? {} : { providerAccountId: row.provider_account_id }),
    ...(row.label === null ? {} : { label: row.label }),
    currency: row.currency,
    status: oneOf<AdAccountStatus>(AD_ACCOUNT_STATUSES, row.status, "unknown"),
    ...(goal === undefined ? {} : { goal }),
  };
}

export const toAdCampaign = (row: Tables<"ad_campaigns">): AdCampaign => ({
  id: row.id,
  accountId: row.account_id,
  externalId: row.external_id,
  name: row.name,
  status: oneOf<AdEntityStatus>(AD_ENTITY_STATUSES, row.status, "unknown"),
});

export const toAdSet = (row: Tables<"ad_sets">): AdSet => ({
  id: row.id,
  campaignId: row.campaign_id,
  externalId: row.external_id,
  name: row.name,
  status: oneOf<AdEntityStatus>(AD_ENTITY_STATUSES, row.status, "unknown"),
  ...(row.daily_budget === null ? {} : { dailyBudget: row.daily_budget }),
});

export const toAdCreative = (row: Tables<"ad_creatives">): AdCreative => ({
  id: row.id,
  ...(row.external_id === null ? {} : { externalId: row.external_id }),
  format: oneOf<AdFormat>(AD_FORMATS, row.format, "unknown"),
  ...(row.aspect === null ? {} : { aspect: row.aspect }),
  ...(row.source_content_id === null ? {} : { sourceContentId: row.source_content_id }),
});

export const toAd = (row: Tables<"ads">): Ad => ({
  id: row.id,
  adSetId: row.ad_set_id,
  externalId: row.external_id,
  name: row.name,
  status: oneOf<AdEntityStatus>(AD_ENTITY_STATUSES, row.status, "unknown"),
  ...(row.creative_id === null ? {} : { creativeId: row.creative_id }),
  ...(row.started_on === null ? {} : { startedOn: row.started_on }),
});

export const toAdDailyMetric = (row: Tables<"ad_daily_metrics">): AdDailyMetric => ({
  adId: row.ad_id,
  date: row.date,
  spend: row.spend,
  impressions: row.impressions,
  ...(opt(row.clicks) === undefined ? {} : { clicks: row.clicks as number }),
  ...(opt(row.results) === undefined ? {} : { results: row.results as number }),
  ...(opt(row.result_value) === undefined ? {} : { resultValue: row.result_value as number }),
  ...(opt(row.frequency) === undefined ? {} : { frequency: row.frequency as number }),
  ...(opt(row.reach) === undefined ? {} : { reach: row.reach as number }),
  ...(opt(row.video_3s_views) === undefined ? {} : { video3sViews: row.video_3s_views as number }),
  ...(opt(row.video_thruplays) === undefined ? {} : { videoThruplays: row.video_thruplays as number }),
  ...(opt(row.avg_watch_sec) === undefined ? {} : { avgWatchSec: row.avg_watch_sec as number }),
});
