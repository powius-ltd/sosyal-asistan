/**
 * Özet → düşülecek birim sayısı (saf). Yalnız TAMAMLANAN birim sayılır: başarısız hesap / video, başlatılmayan koşu ve üretilemeyen plan
 * düşülmez (plan `docs/KREDI-PLAN.md` §4). Tek adımlı işler ve haftalık turun adımları AYNI fonksiyonları kullanır.
 */
import type { DiscoverSummary } from "@/lib/collection/discover";
import type { CollectSummary } from "@/lib/collection/types";
import type { AnalyzeSummary } from "@/lib/intel/analyze-run";
import type { BriefingRunResult } from "@/lib/intel/briefing-run";
import type { PlanRunResult } from "@/lib/intel/plan-run";
import type { MeasureResult } from "@/lib/outcomes/measure-run";

/** İçeriği gerçekten alınan hesap sayısı (koşusu düşen, erişilemeyen ya da atlanan hesap sayılmaz). Koşu başlamadıysa 0. */
export function scannedAccounts(summary: Pick<CollectSummary, "outcome" | "targets">): number {
  if (summary.outcome !== "completed") return 0;
  return summary.targets.filter(({ content }) => content !== undefined && content.error === undefined && content.accessError === undefined && content.skippedReason === undefined).length;
}

/** Ölçümü gerçekten yapılan kendi hesap sayısı (koşu başlamadıysa 0). */
export function measuredAccounts(result: Pick<MeasureResult, "dryRun" | "collect">): number {
  return result.dryRun || result.collect === undefined ? 0 : scannedAccounts(result.collect);
}

/** İncelemesi tamamlanan video sayısı: sonuç veren + "yetersiz veri" çıkan (inceleme yapıldı); düşen video sayılmaz. */
export function reviewedVideos(summary: Pick<AnalyzeSummary, "ok" | "insufficient">): number {
  return summary.ok + summary.insufficient;
}

/** Keşifte yazılan aday sayısı (koşu başlamadıysa 0); aday başına bir hesap taraması kalemi. */
export function discoveredAccounts(summary: Pick<DiscoverSummary, "outcome" | "written">): number {
  return summary.outcome === "completed" ? summary.written : 0;
}

/** Plan kaydedildiyse 1 (mevcut plan korunduysa ya da üretilemediyse 0). */
export function savedPlans(result: Pick<PlanRunResult, "outcome">): number {
  return result.outcome === "saved" ? 1 : 0;
}

/** Notlar üretildiyse 1. */
export function writtenBriefings(result: Pick<BriefingRunResult, "ok">): number {
  return result.ok ? 1 : 0;
}
