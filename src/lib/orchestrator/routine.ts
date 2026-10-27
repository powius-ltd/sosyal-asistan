/**
 * `runRoutine`: haftalık rutinin yürütücüsü. Sıra: 0 önkontrol + bakım → 1 topla → 2 analiz → 3 etiketle → 4 konu kümele → 5 planla →
 * 6 ölçüm kontrolü → 7 brifing → rapor. Etiket ve kümele adımları hesap türüne göre atlanır (`plan-routine`). Kararları `planRoutine` verir (saf); burada yalnız yürütme kuralları vardır:
 *  - `skip` ve `needs_approval` adımları ÇALIŞTIRILMAZ (Apify onayı yoksa toplama fonksiyonu hiç çağrılmaz).
 *  - Bir adımın hatası bağımlı olmayan adımları durdurmaz (adım `failed`, sıradakine geçilir).
 *  - Kalıcı LLM hatası (Claude CLI yok/oturum yok): kalan LLM adımları (3, 4, 5, 7) denenmez.
 *  - `dryRun`: yalnız durum + kararlar; önkontrol/adım/rapor yazımı YOK (hiçbir LLM/Apify/yazma/alt süreç).
 * Çıkış kodu: 0 hepsi ok ya da tasarım gereği atlandı/onay bekliyor · 4 en az bir adım failed · 1 önkontrol (ya da durum okunamadı).
 * Bağımlılıklar (`RoutineDeps`) enjekte edilir: gerçek bağlama `steps.ts`, testler sahte verir.
 */
import { isLlmUnavailableError } from "@/lib/orchestrator/llm-failure";
import { planRoutine } from "@/lib/orchestrator/plan-routine";
import type { PlanEntry, ReportStepId, RoutineExitCode, RoutinePlan, RoutineReport, RoutineState, RoutineStepId, StepOutput, StepResult } from "@/lib/orchestrator/types";

/** Bir adıma verilen girdi: durum + önceki adımların brifing için bıraktığı plan notu. */
export interface StepInput {
  state: RoutineState;
  /** Plan adımının sonucu ("plan durumu"): `voice_unusable`/`kept_existing` hata değildir, brifinge bilgi olarak girer. */
  planNote?: string;
}

export type StepRunner = (input: StepInput) => Promise<StepOutput>;

export interface RoutineDeps {
  /** Rutinin başladığı an (tek saat). */
  now: Date;
  dryRun: boolean;
  log: (line: string) => void;
  /** Süre ölçümü (ms; varsayılan `performance.now`). */
  clock?: () => number;
  loadState: () => Promise<RoutineState>;
  /** Adım 0: önkontrol + bakım. `failed` dönerse rutin durur (çıkış 1). Kuru koşuda ÇAĞRILMAZ. */
  precheck: (state: RoutineState, plan: RoutinePlan) => Promise<StepOutput>;
  steps: Record<RoutineStepId, StepRunner>;
  /** Adım 7: raporu yazar (dosya + bildirim); hata rutini düşürmez. Kuru koşuda ÇAĞRILMAZ. Günlüğe yazılacak satırları döndürür. */
  writeReport: (report: RoutineReport) => Promise<string[]>;
}

/** Claude kullanan adımlar: kalıcı LLM hatasında atlanır. */
const LLM_STEPS: ReadonlySet<RoutineStepId> = new Set<RoutineStepId>(["label", "cluster", "plan", "briefing"]);

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : "bilinmeyen hata");

export function exitCodeOf(steps: readonly Pick<StepResult, "step" | "status">[]): RoutineExitCode {
  if (steps.some((s) => s.step === "precheck" && s.status === "failed")) return 1;
  return steps.some((s) => s.status === "failed") ? 4 : 0;
}

async function timed(step: ReportStepId, clock: () => number, run: () => Promise<StepOutput>): Promise<StepResult> {
  const t0 = clock();
  let output: StepOutput;
  try {
    output = await run();
  } catch (error) {
    output = { status: "failed", reason: errorMessage(error), ...(isLlmUnavailableError(error) ? { llmUnavailable: true } : {}) };
  }
  return { ...output, step, seconds: Math.round((clock() - t0) / 100) / 10 };
}

function decidedResult({ step, decision }: PlanEntry): StepResult | undefined {
  if (decision.action === "skip") return { step, status: "skipped", reason: decision.reason, seconds: 0 };
  if (decision.action === "needs_approval") {
    return { step, status: "needs_approval", reason: decision.reason, seconds: 0, ...(decision.estimateUsd === undefined ? {} : { spend: { estimateUsd: decision.estimateUsd } }) };
  }
  return undefined;
}

export async function runRoutine(deps: RoutineDeps): Promise<RoutineReport> {
  const clock = deps.clock ?? (() => performance.now());
  const base = { startedAt: deps.now.toISOString(), dryRun: deps.dryRun };

  let state: RoutineState;
  try {
    state = await deps.loadState();
  } catch (error) {
    const steps: StepResult[] = [{ step: "precheck", status: "failed", reason: `Durum okunamadı (DB): ${errorMessage(error)}`, seconds: 0 }];
    return { ...base, steps, exitCode: 1 };
  }
  const plan = planRoutine(state);
  if (deps.dryRun) return { ...base, state, plan, steps: [], exitCode: 0 };

  const results: StepResult[] = [];
  const precheck = await timed("precheck", clock, () => deps.precheck(state, plan));
  results.push(precheck);
  if (precheck.status === "failed") {
    const report: RoutineReport = { ...base, state, plan, steps: results, exitCode: 1 };
    await finishReport(deps, report);
    return report;
  }

  let llmDown = false;
  let planNote: string | undefined;
  for (const entry of plan) {
    const { step, decision } = entry;
    deps.log(`— ${step}: ${decision.action}${decision.action === "run" ? "" : ` (${decision.reason})`}`);
    const decided = decidedResult(entry);
    if (decided !== undefined) {
      results.push(decided);
      continue;
    }
    if (llmDown && LLM_STEPS.has(step)) {
      results.push({ step, status: "skipped", reason: "Claude CLI kalıcı hata verdi (önceki LLM adımı): kalan LLM adımları denenmedi.", seconds: 0 });
      continue;
    }
    const result = await timed(step, clock, () => deps.steps[step]({ state, planNote }));
    results.push(result);
    if (result.llmUnavailable) llmDown = true;
    if (step === "plan") planNote = result.planNote ?? result.reason;
    deps.log(`  → ${result.status}: ${result.reason}`);
  }

  const report: RoutineReport = { ...base, state, plan, steps: results, exitCode: exitCodeOf(results) };
  await finishReport(deps, report);
  return report;
}

async function finishReport(deps: RoutineDeps, report: RoutineReport): Promise<void> {
  try {
    for (const line of await deps.writeReport(report)) deps.log(line);
  } catch (error) {
    deps.log(`Uyarı: rapor yazılamadı: ${errorMessage(error)}`);
  }
}
