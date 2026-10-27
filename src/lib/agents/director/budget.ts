/**
 * Yönetici ajanın aylık tavan hesabı (SAF kısım + okuyucu). Tavan = `workspaces.agent_monthly_cap_usd` (onaylı; NULL = onaysız = ajan harcayamaz).
 * Harcanan = bu ayın (İstanbul takvim ayı) `monthly_cap` dayanaklı toplama + rakip bulma işlerinin koşuları: Σ greatest(gerçek, rezerve)
 * (`reserve_budget` ile aynı kural; mutabakatı olmayan koşuda rezerve tutar sayılır, gerçek 0 varsayılmaz). Ölçüm tavanı deseni: `outcomes/measure-budget.ts`.
 */
import "server-only";

import { roundUsd } from "@/lib/apify/usd";
import { FALLBACK_UNIT_PRICE_USD } from "@/lib/apify/pricing";
import { monthKeyOf, monthRange } from "@/lib/data/supabase/cost";
import { AGENT_CAP_KINDS } from "@/lib/domain/panel-job";
import type { AdminClient } from "@/lib/supabase/admin";

/** Ay sınırı: spec (a) "İstanbul takvim ayı"; çalışma alanı saat diliminden bağımsız. */
export const AGENT_MONTH_TIME_ZONE = "Europe/Istanbul";

/** Rakip bulmanın (ilgili hesaplar ücretsiz + arama) tek tur tahmini (USD); başlangıç akışının hesaba bakış tavanıyla aynı. */
export const DISCOVER_ESTIMATE_USD = 0.2;

export interface AgentBudgetInput {
  /** Onaylı aylık ajan tavanı; undefined = onaysız. */
  capUsd?: number;
  /** Bu ay ajan dayanaklı koşulara sayılan tutar. */
  spentUsd: number;
}

export interface AgentBudget {
  /** Tavan onaylı mı (0 da onaylıdır; harcatmaz). */
  approved: boolean;
  capUsd?: number;
  spentUsd: number;
  /** Kalan hak (≥ 0). Onaysızken 0. */
  remainingUsd: number;
}

export function agentBudget(input: AgentBudgetInput): AgentBudget {
  const spentUsd = roundUsd(Math.max(input.spentUsd, 0));
  if (input.capUsd === undefined) return { approved: false, spentUsd, remainingUsd: 0 };
  return { approved: true, capUsd: input.capUsd, spentUsd, remainingUsd: roundUsd(Math.max(input.capUsd - spentUsd, 0)) };
}

/** Tahmin kalan hakka sığar mı. Tahmin yoksa (undefined) SIĞMAZ: tahmini olmayan ücretli iş açılmaz. */
export function canAfford(budget: AgentBudget, estimateUsd: number | undefined): boolean {
  return budget.approved && budget.remainingUsd > 0 && estimateUsd !== undefined && Number.isFinite(estimateUsd) && estimateUsd >= 0 && roundUsd(estimateUsd) <= budget.remainingUsd;
}

export interface CollectEstimateInput {
  /** Kendi hesap + izlenen rakip sayısı. */
  accounts: number;
  /** Hesap başına video (`collect_video_limit`). */
  videosPerAccount: number;
}

/** Toplama tahmini: hesap × video × yedek birim fiyat (ağ okuması yok; muhafazakâr). Hesap ya da video yoksa undefined. */
export function estimateCollectUsd(input: CollectEstimateInput): number | undefined {
  if (!(input.accounts > 0) || !(input.videosPerAccount > 0)) return undefined;
  return roundUsd(input.accounts * input.videosPerAccount * FALLBACK_UNIT_PRICE_USD);
}

/** Tek ücretli adımın tahmini; tanınmayan tür için undefined. */
export function estimateAgentStepUsd(kind: string, collect: CollectEstimateInput): number | undefined {
  if (kind === "collect") return estimateCollectUsd(collect);
  if (kind === "discover") return DISCOVER_ESTIMATE_USD;
  return undefined;
}

/** DB'den okur: onaylı tavan + bu ayın ajan harcaması. Çalışma alanı yoksa fırlatır. */
export async function loadAgentBudget(db: AdminClient, workspaceId: string, now: Date): Promise<AgentBudget> {
  const workspace = await db.from("workspaces").select("agent_monthly_cap_usd").eq("id", workspaceId).maybeSingle();
  if (workspace.error) throw new Error(`Çalışma alanı okunamadı: ${workspace.error.message}`);
  if (!workspace.data) throw new Error(`Çalışma alanı bulunamadı: ${workspaceId}`);
  const { from, to } = monthRange(monthKeyOf(now, AGENT_MONTH_TIME_ZONE), AGENT_MONTH_TIME_ZONE);
  const jobs = await db
    .from("panel_jobs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("approval_basis", "monthly_cap")
    .in("kind", [...AGENT_CAP_KINDS])
    .lt("created_at", to);
  if (jobs.error) throw new Error(`Ajan işleri okunamadı: ${jobs.error.message}`);
  const ids = (jobs.data ?? []).map((job) => job.id);
  let spent = 0;
  if (ids.length > 0) {
    const runs = await db.from("collection_runs").select("reserved_usd, actual_usd").eq("workspace_id", workspaceId).in("panel_job_id", ids).gte("started_at", from).lt("started_at", to);
    if (runs.error) throw new Error(`Ajan koşuları okunamadı: ${runs.error.message}`);
    spent = (runs.data ?? []).reduce((sum, run) => sum + Math.max(run.actual_usd ?? 0, run.reserved_usd), 0);
  }
  return agentBudget({ capUsd: workspace.data.agent_monthly_cap_usd ?? undefined, spentUsd: spent });
}
