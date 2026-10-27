/**
 * `measure:now` orkestrasyonu: yalnız KENDİ hesap, son 10 gün, ≤ 10 Reels (1 profil + N Reel koşusu; `purpose = measurement`).
 *
 * Sıra: (1) DB'de pencerede (son 10 gün) kendi Reels yoksa Apify'a HİÇ gidilmez ("ölçülecek Reels yok, harcama $0") →
 * (2) tahmin (aktör fiyatı Apify'dan okunur; para harcanmaz) → (3) onay kuralı (`decideMeasureBudget`: açık `--max-usd` ya da
 * onaylı aylık ölçüm tavanı + kalan hak; tavan NULL → ret) → (4) `--dry-run` burada biter → (5) gerçek koşu `collectOnce` ile
 * (toplama sonrası döngü işleri orada çalışır). Para harcayan tek çağrı (5)'tir ve yalnız onay geçtikten sonra yapılır.
 */
import "server-only";

import { MAX_USD_CEILING } from "@/lib/collection/parse-args";
import { collectOnce } from "@/lib/collection/collect-once";
import { plannedAccountCount } from "@/lib/collection/plan-targets";
import type { CollectSummary } from "@/lib/collection/types";
import { formatDecimal, formatNumber } from "@/lib/format";
import { measureLookbackStart, MEASURE_LOOKBACK_DAYS } from "@/lib/outcomes/due";
import { listOwnRecentReelIds } from "@/lib/outcomes/load";
import { decideMeasureBudget, loadMeasureBudgetState, type BudgetDecision, type MeasureBudgetState } from "@/lib/outcomes/measure-budget";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";

/** Bir ölçüm koşusunda en çok bu kadar Reels (limit). */
export const MEASURE_MAX_REELS = 10;

export interface MeasureOptions {
  workspaceId: string;
  /** Tek saat: pencere ve kalan hak bu ana göre. */
  now: Date;
  dryRun: boolean;
  /** Tek seferlik harcama onayı (`--max-usd`). */
  maxUsd?: number;
  log?: (line: string) => void;
}

/** Test için değiştirilebilen bağımlılıklar; varsayılanlar gerçek modüller. */
export interface MeasureDeps {
  client?: AdminClient;
  collect?: typeof collectOnce;
  countReels?: (client: AdminClient, workspaceId: string, now: Date) => Promise<number>;
  budgetState?: (client: AdminClient, workspaceId: string, now: Date) => Promise<MeasureBudgetState>;
}

export type MeasureOutcome = "no_reels" | "no_targets" | "refused" | "dry_run" | "completed" | "blocked";

export interface MeasureResult {
  outcome: MeasureOutcome;
  dryRun: boolean;
  /** Pencerede (son 10 gün) bilinen kendi Reels sayısı (≤ 10). */
  reelCount: number;
  /** Ölçülecek kendi hesap sayısı (önizleme planındaki ayrık hedefler; kredi tahmininin girdisi). Plan yoksa undefined. */
  accountCount?: number;
  estimateUsd?: number;
  jobs: { label: string; actorId: string; results: number; usd: number }[];
  decision?: BudgetDecision;
  collect?: CollectSummary;
  notes: string[];
}

const usd = (amount: number | undefined) => {
  const text = formatDecimal(amount, 4);
  return text === undefined ? "—" : `${text} USD`;
};

export async function measureOnce(options: MeasureOptions, depsIn: MeasureDeps = {}): Promise<MeasureResult> {
  const client = depsIn.client ?? getAdminClient();
  const collect = depsIn.collect ?? collectOnce;
  const countReels =
    depsIn.countReels ?? (async (c: AdminClient, ws: string, now: Date) => (await listOwnRecentReelIds(c, ws, now, MEASURE_MAX_REELS)).length);
  const budgetState = depsIn.budgetState ?? loadMeasureBudgetState;
  const base = { dryRun: options.dryRun, jobs: [], notes: [] as string[] };

  const reelCount = await countReels(client, options.workspaceId, options.now);
  if (reelCount === 0) return { ...base, outcome: "no_reels", reelCount: 0 };

  const common = {
    workspaceId: options.workspaceId,
    now: options.now,
    ownOnly: true,
    newerThan: measureLookbackStart(options.now),
    limit: reelCount,
    purpose: "measurement" as const,
    log: options.log,
  };
  const preview = await collect({ ...common, dryRun: true, maxUsd: MAX_USD_CEILING });
  if (preview.outcome === "no_targets" || preview.plan === undefined) return { ...base, outcome: "no_targets", reelCount, notes: preview.notes };

  const estimateUsd = preview.plan.estimatedUsd;
  const jobs = preview.plan.jobs.map((job) => ({ label: job.label, actorId: job.spec.actorId, results: job.spec.expectedResults, usd: job.estimatedUsd }));
  const notes = preview.plan.priceUnknown ? ["En az bir aktörün fiyatı okunamadı: tahmin muhafazakâr varsayımdan."] : [];

  const state = await budgetState(client, options.workspaceId, options.now);
  const decision = decideMeasureBudget({ estimateUsd, flagMaxUsd: options.maxUsd, monthlyCapUsd: state.monthlyCapUsd, spentUsd: state.spentUsd });
  const accountCount = plannedAccountCount(preview.plan);
  const known = { dryRun: options.dryRun, reelCount, accountCount, estimateUsd, jobs, decision, notes };
  if (!decision.allowed) return { ...known, outcome: "refused" };
  if (options.dryRun) return { ...known, outcome: "dry_run" };

  const summary = await collect({ ...common, dryRun: false, maxUsd: decision.maxUsd });
  return { ...known, outcome: summary.outcome === "blocked" ? "blocked" : "completed", collect: summary, notes: [...notes, ...summary.notes] };
}

/** `MeasureResult` → CLI çıktısı (gizli değer yok). */
export function formatMeasureResult(result: MeasureResult): string[] {
  if (result.outcome === "no_reels") {
    return [`Ölçülecek Reels yok (son ${MEASURE_LOOKBACK_DAYS} günde yayınlanmış kendi Reels'i bilinmiyor), harcama $0. Apify'a gidilmedi.`];
  }
  if (result.outcome === "no_targets") return ["Ölçülecek kendi hesap yok, harcama $0.", ...result.notes.map((n) => `Not: ${n}`)];

  const lines = [
    `Ölçüm: son ${MEASURE_LOOKBACK_DAYS} günde ${formatNumber(result.reelCount)} kendi Reels'i (en çok ${MEASURE_MAX_REELS}); yalnız kendi hesap.`,
    `Plan: ${formatNumber(result.jobs.length)} koşu, tahmini toplam ${usd(result.estimateUsd)}`,
    ...result.jobs.map((job) => `  ${job.label} [${job.actorId}, ${formatNumber(job.results)} sonuç]: ${usd(job.usd)}`),
  ];
  const { decision } = result;
  if (decision?.allowed) lines.push(`Onay: ${decision.note}`);
  if (decision && !decision.allowed) lines.push(`${result.dryRun ? "KURU KOŞU: harcama reddedilirdi. " : "REDDEDİLDİ: "}${decision.reason}`);
  if (result.outcome === "dry_run") lines.push("Kuru koşu: hiçbir koşu başlatılmadı, para harcanmadı.");
  if (result.outcome === "blocked") lines.push("Tahmin tavanı aşıyor: hiçbir koşu başlatılmadı.");
  if (result.collect?.cost) lines.push(`Maliyet: rezerve ${usd(result.collect.cost.reservedUsd)}, gerçek ${result.collect.cost.actualUsd === undefined ? "mutabakat bekliyor" : usd(result.collect.cost.actualUsd)}`);
  if (result.collect?.afterCollect) {
    const after = result.collect.afterCollect;
    lines.push(
      `Döngü: ${formatNumber(after.resolved)} bağ çözüldü, ${formatNumber(after.suggested)} öneri, ${formatNumber(after.dueCount)} Reels'in ölçümü açık (${formatNumber(after.dueNotifications)} yeni bildirim)`,
    );
  }
  lines.push(...result.notes.map((n) => `Not: ${n}`));
  return lines;
}
