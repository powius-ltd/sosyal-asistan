/**
 * Rutinin GERÇEK bağlaması: `RoutineDeps`'i mevcut `runX` işlevlerine bağlar (onlara dokunmaz, yalnız çağırır). Test için `routine.ts`
 * sahte bağımlılık alır; bu dosya betikte (`scripts/routine.mts`) kullanılır.
 *
 * BRİFİNG ENJEKSİYONU: Analist'in `runBriefing`'i (`lib/intel/briefing-run`, Ajan A) bu dosyada import EDİLMEZ; `RoutineWiring.runBriefing`
 * ile dışarıdan verilir (`scripts/routine.mts`'te bağlanır). Verilmezse adım "henüz bağlı değil" diye `skipped` olur. Sonuç → adım çevirisi
 * (notlar, konu kümeleme) `step-runners.ts`'tedir: betik ve panel işçisi aynısını kullanır.
 */
import "server-only";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { collectOnce } from "@/lib/collection/collect-once";
import type { CollectSummary } from "@/lib/collection/types";
import { checkMeasurementDue } from "@/lib/outcomes/notify";
import { formatNumber } from "@/lib/format";
import { DEFAULT_ANALYZE_LIMIT } from "@/lib/intel/analysis-select";
import { runAnalysis, type AnalyzeSummary } from "@/lib/intel/analyze-run";
import type { AnalyzeArgs } from "@/lib/intel/args";
import type { IntelContext } from "@/lib/intel/context";
import { runHousekeeping } from "@/lib/intel/housekeeping";
import { runLabeling } from "@/lib/intel/label-run";
import { runPlan, type PlanRunResult } from "@/lib/intel/plan-run";
import { runSubprocess } from "@/lib/llm/subprocess";
import type { RoutineArgs } from "@/lib/orchestrator/args";
import { tapLlmFailure } from "@/lib/orchestrator/llm-failure";
import { writeRoutineReport } from "@/lib/orchestrator/report-write";
import type { RoutineDeps, StepRunner } from "@/lib/orchestrator/routine";
import { loadRoutineState } from "@/lib/orchestrator/state";
import { analyzeOutput, collectOutput, labelOutput, planOutput } from "@/lib/orchestrator/step-outputs";
import type { RoutineState, StepOutput } from "@/lib/orchestrator/types";
import { workspaceDocDir } from "@/lib/workspace/doc-dir";
import { workspaceCommand } from "@/lib/workspace/command";

/** Brifing adımının girdisi: Analist `intel` bağlamıyla çalışır; `planNote` plan adımının sonucudur ("plan durumu"). */
export interface BriefingStepContext {
  intel: IntelContext;
  /** `loadRoutineState` çıktısı (hedef hafta, bayatlık vb.). */
  state: RoutineState;
  planNote?: string;
  log: (line: string) => void;
}

/** `ok: false` → adım failed (önceki brifing kalır). `skipped: true` → tasarım gereği atlandı (ör. çıktı gerekmedi). */
export interface BriefingStepResult {
  ok: boolean;
  skipped?: boolean;
  note?: string;
}

export type BriefingRunner = (ctx: BriefingStepContext) => Promise<BriefingStepResult>;

/** Kümele adımının girdisi: kümeleme `intel` bağlamıyla çalışır (kendi okur, `content_topic_clusters`'a yazar). */
export interface ClusterStepContext {
  intel: IntelContext;
  log: (line: string) => void;
}

/** `ok: false` → adım failed. `skipped: true` → tasarım gereği atlandı (ör. kümelenecek yeterli video yok). `note` = tek satır özet. */
export interface ClusterStepResult {
  ok: boolean;
  skipped?: boolean;
  note?: string;
  /** Kalıcı LLM hatası (Claude CLI yok/oturum yok): kalan LLM adımları denenmez. */
  llmUnavailable?: boolean;
}

export type ClusterRunner = (ctx: ClusterStepContext) => Promise<ClusterStepResult>;

export interface ClaudeAvailability {
  available: boolean;
  reason?: string;
}

export interface RoutineWiring {
  args: RoutineArgs;
  log: (line: string) => void;
  /** Analist brifingi (Ajan A); verilmezse brifing adımı `skipped`. */
  runBriefing?: BriefingRunner;
  /** Konu kümeleme (P1 `clusterOnly(ctx)`); verilmezse kümele adımı `skipped` (durumda `clustering.available = false`). */
  clusterOnly?: ClusterRunner;
  /** Claude CLI varlık kontrolü (model çağrısı yapmaz); varsayılan `claude --version`. */
  checkClaude?: () => Promise<ClaudeAvailability>;
  /** Video inceleme adımının kancaları (panel işçisi: sayaç + videolar arası durma). Betik vermez: adım kancasız koşar. */
  analyzeHooks?: Pick<AnalyzeArgs, "onProgress" | "shouldStop">;
  /** İnceleme özeti adım sonucuna çevrilmeden ÖNCE çağrılır (panel işçisi: durma yüzünden yarıda kesildi mi). */
  onAnalyzed?: (summary: AnalyzeSummary) => void;
  /** İnceleme adımının video tavanı, adım BAŞLARKEN sorulur (panel işçisi: kalan krediye sığan sayı). Verilmezse `DEFAULT_ANALYZE_LIMIT`. */
  analyzeLimit?: () => number;
  /** Toplama / plan özeti adım sonucuna çevrilmeden ÖNCE çağrılır (panel işçisi: yapılan birimi sayar). */
  onCollected?: (summary: CollectSummary) => void;
  onPlanned?: (result: PlanRunResult) => void;
}

const FLAG_TIMEOUT_MS = 15_000;

/** `claude --version`: model çağrısı yok, abonelik harcamaz. Yürütülebilir dosya `claude-cli.ts` ile aynı çözülür. */
export async function checkClaudeCli(env: Record<string, string | undefined> = process.env): Promise<ClaudeAvailability> {
  const command = env.CLAUDE_CLI_PATH?.trim() || "claude";
  try {
    const result = await runSubprocess({ command, args: ["--version"], timeoutMs: FLAG_TIMEOUT_MS });
    return result.exitCode === 0 ? { available: true } : { available: false, reason: `claude --version çıkış kodu ${String(result.exitCode)}.` };
  } catch {
    return { available: false, reason: "claude bulunamadı: kurun ya da CLAUDE_CLI_PATH ile tam yolunu verin." };
  }
}

/**
 * `plan:week` betiğiyle aynı konum/ad: `docs/haftalik-plan/<slug>/<hafta>[-taslak].md` (çalışma alanı başına klasör). Yazılan yol; yazılamazsa
 * undefined (not düşer, planı bozmaz). Haftalık turun plan adımı ve panel işçisinin "Planı hazırla" işi AYNI işlevi kullanır.
 */
export function savePlanMarkdown(ctx: Pick<IntelContext, "workspaceId" | "workspaceSlug">, result: PlanRunResult, rootDir: string = process.cwd()): string | undefined {
  try {
    const dir = workspaceDocDir(rootDir, "haftalik-plan", { id: ctx.workspaceId, slug: ctx.workspaceSlug });
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${result.weekStart}${result.outcome === "saved" ? "" : "-taslak"}.md`);
    writeFileSync(file, result.markdown, "utf8");
    return file;
  } catch {
    return undefined;
  }
}

export function createRoutineDeps(ctx: IntelContext, wiring: RoutineWiring): RoutineDeps {
  const { args, log } = wiring;
  const checkClaude = wiring.checkClaude ?? (() => checkClaudeCli());

  const collect: StepRunner = async () => {
    if (args.apifyMaxUsd === undefined) throw new Error("Apify onayı yok: toplama çağrılamaz."); // plan zaten needs_approval verir; çifte emniyet
    const summary = await collectOnce({ workspaceId: ctx.workspaceId, maxUsd: args.apifyMaxUsd, now: ctx.now, log });
    wiring.onCollected?.(summary);
    return collectOutput(summary);
  };

  const analyze: StepRunner = async () => {
    const summary = await runAnalysis(ctx, { pilot: false, limit: wiring.analyzeLimit?.() ?? DEFAULT_ANALYZE_LIMIT, dryRun: false, concurrency: args.concurrency, ...wiring.analyzeHooks }, log);
    wiring.onAnalyzed?.(summary);
    return analyzeOutput(summary);
  };

  const label: StepRunner = async () => {
    const tap = tapLlmFailure(log);
    const summary = await runLabeling(ctx, { dryRun: false }, tap.log);
    return labelOutput(summary, tap.tripped);
  };

  const plan: StepRunner = async ({ state }) => {
    const result = await runPlan(ctx, { week: state.planWeek, dryRun: false }, log);
    wiring.onPlanned?.(result);
    return planOutput(result, savePlanMarkdown(ctx, result));
  };

  const cluster: StepRunner = async (): Promise<StepOutput> => {
    if (wiring.clusterOnly === undefined) return { status: "skipped", reason: "Konu kümeleme henüz bağlı değil." };
    const result = await wiring.clusterOnly({ intel: ctx, log });
    const notes = result.note === undefined ? [] : [result.note];
    if (result.skipped) return { status: "skipped", reason: result.note ?? "Konu kümeleme atlandı.", notes };
    if (result.ok) return { status: "ok", reason: result.note ?? "Konu kümeleri güncellendi.", notes };
    return { status: "failed", reason: result.note ?? "Konu kümeleme başarısız.", notes, ...(result.llmUnavailable ? { llmUnavailable: true } : {}) };
  };

  const measureCheck: StepRunner = async ({ state }) => {
    const { due, created } = await checkMeasurementDue(ctx.client, ctx.workspaceId, ctx.now);
    const notes =
      due.length === 0
        ? []
        : [
            `Ölçmek için: ${workspaceCommand("measure:now", { id: ctx.workspaceId, slug: ctx.workspaceSlug })} --dry-run (ölçüm koşusu ayrı komut, Apify parası).`,
            ...(state.measurement.capApproved ? [] : ["Ölçüm tavanı ONAYSIZ: onaylanana kadar ölçüm koşusu yapılamaz."]),
          ];
    return { status: "ok", reason: `${formatNumber(due.length)} Reels'in ölçümü geldi, ${formatNumber(created)} yeni bildirim yazıldı (Apify çağrılmadı, harcama $0).`, notes };
  };

  const briefing: StepRunner = async ({ state, planNote }): Promise<StepOutput> => {
    if (wiring.runBriefing === undefined) return { status: "skipped", reason: "Brifing ajanı (Analist) henüz bağlı değil." };
    const result = await wiring.runBriefing({ intel: ctx, state, planNote, log });
    const notes = result.note === undefined ? [] : [result.note];
    if (result.skipped) return { status: "skipped", reason: result.note ?? "Brifing atlandı.", notes };
    return result.ok ? { status: "ok", reason: "Brifing üretildi.", notes } : { status: "failed", reason: result.note ?? "Brifing üretilemedi: önceki brifing kalır.", notes };
  };

  return {
    now: ctx.now,
    dryRun: args.dryRun,
    log,
    loadState: () => loadRoutineState(ctx, { apifyMaxUsd: args.apifyMaxUsd, clusteringAvailable: wiring.clusterOnly !== undefined }),
    precheck: async (_state, plan) => {
      const needsClaude = plan.some((e) => e.decision.action === "run" && ["label", "cluster", "plan", "briefing"].includes(e.step));
      const claude = needsClaude ? await checkClaude() : undefined;
      if (claude !== undefined && !claude.available) return { status: "failed", reason: `Claude CLI kullanılamıyor: ${claude.reason ?? "bilinmeyen sebep"}` };
      await runHousekeeping({ client: ctx.client, workspaceId: ctx.workspaceId, now: ctx.now }, log);
      return { status: "ok", reason: `DB okundu${needsClaude ? ", Claude CLI var" : ""}, bakım yapıldı (süresi dolan transcript temizliği, eski koşu kapatma).` };
    },
    steps: { collect, analyze, label, cluster, plan, measure_check: measureCheck, briefing },
    writeReport: (report) => writeRoutineReport(ctx, report),
  };
}
