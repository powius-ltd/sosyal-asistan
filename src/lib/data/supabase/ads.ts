/**
 * Reklam okumaları (Supabase; yalnız OKUR). Depo ham satırları `AdDataset`'e toplar, hesap `data/views/ads.ts`'tedir (mock ile AYNI).
 * Her okuma açıkça `workspace_id` süzgeçlidir (RLS ek güvence); ölçü satırları dönemle sınırlanır (reklam × gün büyür). Çok sayfalı okuma
 * kararlı sıralıdır (`fetchAllRows`: PostgREST 1000 satır sınırı).
 */
import { parseAdDetailQuery, parseAdGoalPatch, parseAdReportQuery, parseAdUsageIds } from "@/lib/data/ad-schema";
import { RepositoryError } from "@/lib/data/repository";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { isUuid, toRepositoryError } from "@/lib/data/supabase/errors";
import { toAd, toAdAccount, toAdCampaign, toAdCreative, toAdDailyMetric, toAdSet } from "@/lib/data/supabase/mappers/ad";
import { fetchAllRows } from "@/lib/data/supabase/paging";
import { requireWorkspace } from "@/lib/data/supabase/workspace";
import { adPeriodOf, buildAdDetail, buildAdReport, sortAdAccounts, type AdDataset, type AdPeriod } from "@/lib/data/views/ads";
import { buildAdUsageFromReports } from "@/lib/matrix/ad-source";
import type { AdAccount, AdDetail, AdReport, AdUsage } from "@/lib/domain/ads";
import type { AdDetailQuery, AdGoalPatch, AdReportQuery } from "@/lib/data/ad-schema";

async function loadStructure(ctx: SupabaseContext, wsId: string): Promise<Omit<AdDataset, "metrics">> {
  const [accounts, campaigns, adSets, ads, creatives] = await Promise.all([
    fetchAllRows((from, to) => ctx.db.from("ad_accounts").select("*").eq("workspace_id", wsId).order("id").range(from, to)),
    fetchAllRows((from, to) => ctx.db.from("ad_campaigns").select("*").eq("workspace_id", wsId).order("id").range(from, to)),
    fetchAllRows((from, to) => ctx.db.from("ad_sets").select("*").eq("workspace_id", wsId).order("id").range(from, to)),
    fetchAllRows((from, to) => ctx.db.from("ads").select("*").eq("workspace_id", wsId).order("id").range(from, to)),
    fetchAllRows((from, to) => ctx.db.from("ad_creatives").select("*").eq("workspace_id", wsId).order("id").range(from, to)),
  ]);
  return {
    accounts: sortAdAccounts(accounts.map(toAdAccount)),
    campaigns: campaigns.map(toAdCampaign),
    adSets: adSets.map(toAdSet),
    ads: ads.map(toAd),
    creatives: creatives.map(toAdCreative),
  };
}

async function loadMetrics(ctx: SupabaseContext, wsId: string, period: AdPeriod): Promise<AdDataset["metrics"]> {
  const rows = await fetchAllRows((from, to) =>
    ctx.db.from("ad_daily_metrics").select("*").eq("workspace_id", wsId).gte("date", period.from).lte("date", period.to).order("ad_id").order("date").range(from, to),
  );
  return rows.map(toAdDailyMetric);
}

/** Çalışma alanının tüm reklam kümesi (varsayılan dönem ölçüleriyle); Kreatif Matris'in reklam tarafı için. Hesap yoksa hesap listesi boştur. */
export async function loadAdDataset(ctx: SupabaseContext, wsId: string, now: Date): Promise<AdDataset> {
  const structure = await loadStructure(ctx, wsId);
  if (structure.accounts.length === 0) return { ...structure, metrics: [] };
  return { ...structure, metrics: await loadMetrics(ctx, wsId, adPeriodOf(now)) };
}

export async function listAdAccounts(ctx: SupabaseContext, wsId: string): Promise<AdAccount[]> {
  // Bilinmeyen çalışma alanı: boş liste (mock ile aynı; hesap yokken hata değildir).
  const rows = await fetchAllRows((from, to) => ctx.db.from("ad_accounts").select("*").eq("workspace_id", wsId).order("id").range(from, to));
  return sortAdAccounts(rows.map(toAdAccount));
}

export async function getAdReport(ctx: SupabaseContext, wsId: string, query: AdReportQuery, now: Date): Promise<AdReport | undefined> {
  const valid = parseAdReportQuery(query);
  await requireWorkspace(ctx, wsId);
  const structure = await loadStructure(ctx, wsId);
  const account = valid.accountId === undefined ? structure.accounts[0] : structure.accounts.find((candidate) => candidate.id === valid.accountId);
  if (valid.accountId !== undefined && account === undefined) throw new RepositoryError("not_found", `Reklam hesabı bulunamadı: ${valid.accountId}`);
  if (account === undefined) return undefined;
  const period = adPeriodOf(now, valid.days);
  return buildAdReport({ ...structure, metrics: await loadMetrics(ctx, wsId, period) }, account, period);
}

export async function getAdDetail(ctx: SupabaseContext, wsId: string, adId: string, query: AdDetailQuery, now: Date): Promise<AdDetail> {
  const valid = parseAdDetailQuery(query);
  await requireWorkspace(ctx, wsId);
  if (!isUuid(adId)) throw new RepositoryError("not_found", `Reklam bulunamadı: ${adId}`);
  const structure = await loadStructure(ctx, wsId);
  const period = adPeriodOf(now, valid.days);
  const detail = buildAdDetail({ ...structure, metrics: await loadMetrics(ctx, wsId, period) }, adId, period);
  if (detail === undefined) throw new RepositoryError("not_found", `Reklam bulunamadı: ${adId}`);
  return detail;
}

export async function listAdUsage(ctx: SupabaseContext, wsId: string, contentIds: readonly string[], now: Date): Promise<AdUsage[]> {
  const ids = parseAdUsageIds([...contentIds]);
  await requireWorkspace(ctx, wsId);
  if (ids.length === 0) return [];
  const structure = await loadStructure(ctx, wsId);
  return buildAdUsageFromReports({ ...structure, metrics: await loadMetrics(ctx, wsId, adPeriodOf(now)) }, ids, now);
}

/** Yalnız hedef sütunları (reklam hesabına değil, kendi tablomuza); `ad_accounts_goal_shape` CHECK'i ikinci güvence. */
export async function updateAdAccountGoal(ctx: SupabaseContext, wsId: string, patch: AdGoalPatch): Promise<AdAccount> {
  const valid = parseAdGoalPatch(patch);
  await requireWorkspace(ctx, wsId);
  const goal = valid.goal;
  const columns = {
    goal_kind: goal?.kind ?? null,
    result_label: goal?.resultLabel ?? null,
    target_return: goal?.kind === "value" ? goal.targetReturn : null,
    gross_margin: goal?.kind === "value" ? (goal.grossMargin ?? null) : null,
    target_cost_per_result: goal?.kind === "cost" ? goal.targetCostPerResult : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await ctx.db.from("ad_accounts").update(columns).eq("id", valid.accountId).eq("workspace_id", wsId).select("*").maybeSingle();
  if (error) throw toRepositoryError(error);
  if (data === null) throw new RepositoryError("not_found", `Reklam hesabı bulunamadı: ${valid.accountId}`);
  return toAdAccount(data);
}
