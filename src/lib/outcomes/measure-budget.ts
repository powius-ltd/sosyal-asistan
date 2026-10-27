/**
 * Ölçüm harcaması onayı: `measure:now` para harcamadan ÖNCE tahmini şu kurala sokar (DB ölçüm tavanını zorlamaz, burası denetler):
 *   (a) açık tek seferlik `--max-usd` verildiyse: tahmin ≤ o tutar ise harcanır (tavan = o tutar);
 *   (b) yoksa ONAYLI aylık ölçüm tavanı (`workspaces.measure_monthly_cap_usd`) ve kalan hak ≥ tahmin ise harcanır;
 *   (c) tavan NULL = onaysız → harcama YOK (0 değil: 0 "ölçüm kapalı"dır, onaylıdır ve yine harcatmaz).
 * Genel Apify aylık tavanı (`reserve_budget`) bunun üstünde aynen geçerlidir. Karar saf fonksiyondur; harcanan tutar DB'den okunur.
 */
import "server-only";

import { roundUsd } from "@/lib/apify/usd";
import { monthKeyOf, monthRange } from "@/lib/data/supabase/cost";
import { formatUsd } from "@/lib/format";
import type { AdminClient } from "@/lib/supabase/admin";

export interface BudgetInput {
  /** Planın tahmini toplamı (USD). */
  estimateUsd: number;
  /** Açık tek seferlik onay (`--max-usd`); verilmediyse undefined. */
  flagMaxUsd?: number;
  /** Onaylı aylık ölçüm tavanı; undefined = onaysız. */
  monthlyCapUsd?: number;
  /** Bu ay ölçüm koşularına sayılan tutar (Σ greatest(gerçek, rezerve)). */
  spentUsd: number;
}

export type BudgetDecision =
  | { allowed: true; basis: "flag" | "monthly_cap"; maxUsd: number; note: string }
  | { allowed: false; reason: string };

const usd = (amount: number) => formatUsd(amount) ?? `${amount} USD`;

export function decideMeasureBudget(input: BudgetInput): BudgetDecision {
  const estimate = roundUsd(input.estimateUsd);
  if (input.flagMaxUsd !== undefined) {
    if (estimate > roundUsd(input.flagMaxUsd)) {
      return { allowed: false, reason: `Tahmini ${usd(estimate)} verilen --max-usd (${usd(input.flagMaxUsd)}) değerini aşıyor; harcama yapılmadı.` };
    }
    return { allowed: true, basis: "flag", maxUsd: input.flagMaxUsd, note: `tek seferlik onay: en çok ${usd(input.flagMaxUsd)}` };
  }
  if (input.monthlyCapUsd === undefined) {
    return {
      allowed: false,
      reason:
        "Aylık ölçüm tavanı onaylı değil (varsayılan: onaysız), harcama yapılmadı. Tek seferlik onay için --max-usd=<tutar> ver " +
        "ya da aylık ölçüm tavanını onayla (Ayarlar).",
    };
  }
  const remaining = roundUsd(Math.max(input.monthlyCapUsd - input.spentUsd, 0));
  if (estimate > remaining) {
    return {
      allowed: false,
      reason: `Aylık ölçüm tavanında kalan hak yetmiyor: kalan ${usd(remaining)} (tavan ${usd(input.monthlyCapUsd)}, bu ay ${usd(input.spentUsd)}), tahmin ${usd(estimate)}; harcama yapılmadı.`,
    };
  }
  return { allowed: true, basis: "monthly_cap", maxUsd: remaining, note: `aylık ölçüm tavanı: kalan ${usd(remaining)} / tavan ${usd(input.monthlyCapUsd)}` };
}

export interface MeasureBudgetState {
  monthlyCapUsd?: number;
  spentUsd: number;
}

/** Workspace'in onaylı ölçüm tavanı ve bu ay ölçüm koşularına sayılan tutar (`reserve_budget` ile aynı kural: Σ greatest(gerçek, rezerve)). */
export async function loadMeasureBudgetState(db: AdminClient, workspaceId: string, now: Date): Promise<MeasureBudgetState> {
  const workspace = await db.from("workspaces").select("timezone, measure_monthly_cap_usd").eq("id", workspaceId).maybeSingle();
  if (workspace.error) throw new Error(`Çalışma alanı okunamadı: ${workspace.error.message}`);
  if (!workspace.data) throw new Error(`Çalışma alanı bulunamadı: ${workspaceId}`);
  const { from, to } = monthRange(monthKeyOf(now, workspace.data.timezone), workspace.data.timezone);
  const runs = await db
    .from("collection_runs")
    .select("reserved_usd, actual_usd")
    .eq("workspace_id", workspaceId)
    .eq("purpose", "measurement")
    .gte("started_at", from)
    .lt("started_at", to);
  if (runs.error) throw new Error(`Ölçüm koşuları okunamadı: ${runs.error.message}`);
  const spent = (runs.data ?? []).reduce((sum, run) => sum + Math.max(run.actual_usd ?? 0, run.reserved_usd), 0);
  return { monthlyCapUsd: workspace.data.measure_monthly_cap_usd ?? undefined, spentUsd: roundUsd(spent) };
}
