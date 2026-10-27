/**
 * Başlangıç işinin iki aşamasının (`probe`, `build`) ortak adım yürütücüsü: adım sınırında durma, "sürüyor" / kapanış yazımı, süre ölçümü.
 *
 * Kural: bir adımın hatası İŞİ DÜŞÜRMEZ (adım `failed` yazılır, çağıran sıradakine geçer ya da hükmünü verir); yalnız durma (iptal, süre
 * tavanı, çit kaybı) adımı başlatmaz. Yazı aracının kalıcı hatası adıma `llm_unavailable` koduyla yazılır.
 */
import "server-only";

import type { JobStepId, PanelJob } from "@/lib/domain/panel-job";
import type { IntelContext } from "@/lib/intel/context";
import type { CreditMeter } from "@/lib/job-runner/credit-meter";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import type { JobSession } from "@/lib/job-runner/job-session";
import type { StepVerdict } from "@/lib/job-runner/outcome-map";
import { secondsSince } from "@/lib/job-runner/run-single";
import { isLlmUnavailableError } from "@/lib/orchestrator/llm-failure";

/** Aşama koşucusunun bağlamı. */
export interface OnboardingRun {
  job: PanelJob;
  ctx: IntelContext;
  session: JobSession;
  deps: JobRunnerDeps;
  clockMs: () => number;
  meter: CreditMeter;
  /** Satırdaki onaydan gelen SABİT harcama tavanı (USD). */
  maxUsd: number;
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : "bilinmeyen hata");

/**
 * Adımı koşturur ve satıra yazar. Dönen değer adımın kapanışıdır; durma yüzünden adım BAŞLATILMADIYSA undefined (iş "kesildi" işaretlidir).
 * `body` fırlatırsa adım `failed` kapanır ve o kapanış döner (hata yukarı çıkmaz).
 */
export async function runStep(run: Pick<OnboardingRun, "session" | "clockMs">, id: JobStepId, body: () => Promise<StepVerdict>): Promise<StepVerdict | undefined> {
  const { session, clockMs } = run;
  if (!(await session.tryStartStep(id))) return undefined;
  const t0 = clockMs();
  let verdict: StepVerdict;
  try {
    verdict = await body();
  } catch (error) {
    const note = errorMessage(error);
    session.log(`Adım ${id} başarısız: ${note}`);
    verdict = { status: "failed", code: isLlmUnavailableError(error) ? "llm_unavailable" : "step_failed", note };
  }
  await session.finishStep(id, { ...verdict, seconds: secondsSince(t0, clockMs()) });
  return verdict;
}

/** Koşmadan kapanan adım (karar gereği atlandı, kredi yetmedi, önceki adım işi durdurdu). */
export async function closeStep(session: JobSession, id: JobStepId, verdict: StepVerdict): Promise<void> {
  await session.finishStep(id, { ...verdict, seconds: 0 });
}

/** İş durduğunda kalan adımlar "atlandı" yazılır (satırda "sırada" görünen adım kalmasın). Durma (iptal / süre) hâlinde ÇAĞRILMAZ. */
export async function skipRemaining(session: JobSession, ids: readonly JobStepId[], note: string): Promise<void> {
  const open = new Set(session.steps().flatMap((step) => (step.status === "pending" ? [step.id] : [])));
  for (const id of ids) if (open.has(id)) await closeStep(session, id, { status: "skipped", note });
}

/** Aşamanın harcama sayacı: tavan satırdaki onaydır; her ücretli adım rezerve ettiğini düşer, sıradaki adıma KALAN verilir. */
export function spendBudget(maxUsd: number): { remaining(): number; add(usd: number | undefined): void; reserved(): number } {
  let reserved = 0;
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return {
    remaining: () => Math.max(0, round(maxUsd - reserved)),
    add: (usd) => {
      if (usd !== undefined && Number.isFinite(usd) && usd > 0) reserved = round(reserved + usd);
    },
    reserved: () => reserved,
  };
}
