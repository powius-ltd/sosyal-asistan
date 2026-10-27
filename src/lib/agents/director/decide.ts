/**
 * Ajanın karar akışı: LLM önerir → kapı (`guard.ts`) denetler → geçerse karar, geçmezse YEDEK. Yedek = halkanın saf zincir kararı
 * (`nextCycleStep`, $0): LLM düşse (zaman aşımı, bozuk JSON, kapıdan dönen öneri) ajan körleşmez, zincir çalışmaya devam eder.
 * Sohbet emrinde yedek zincir DEĞİL bekleyiştir: emre bağlı olmayan bir iş açmak yanlış olurdu. Hata FIRLATILMAZ. Günlük: "ajan yedeği: <neden>".
 */
import "server-only";

import { buildDirectorInput, buildDirectorSystemPrompt } from "@/lib/agents/director/prompt";
import { DIRECTOR_OUTPUT_SCHEMA } from "@/lib/agents/director/schema";
import type { DirectorContext } from "@/lib/agents/director/facts";
import { guardProposal, type DirectorAction, type GuardVerdict } from "@/lib/agents/director/guard";
import type { ChainDecision } from "@/lib/cycle/next";
import type { JobKind } from "@/lib/domain/panel-job";
import { LlmError, type LlmBackend, type LlmCallMeta } from "@/lib/llm/types";

/** Tek model çağrısının süre sınırı (ms). */
export const DIRECTOR_TIMEOUT_MS = 90_000;

export interface DirectorDecision {
  action: DirectorAction;
  kind?: JobKind;
  week?: string;
  message?: string;
  /** Kararı kim verdi: model ya da yedek (zincir / bekleyiş). */
  source: "llm" | "fallback";
  /** Yedeğe düşme nedeni (günlük metni). */
  fallbackReason?: string;
  meta?: LlmCallMeta;
  llmCalled: boolean;
}

export interface DecideDeps {
  llm: LlmBackend;
  model?: string;
  log?: (line: string) => void;
}

/** Zincir kararı → ajan eylemi (yedek). */
function fallbackOf(chain: ChainDecision, ctx: DirectorContext): Pick<DirectorDecision, "action" | "kind" | "week" | "message"> {
  if ("request" in chain) {
    const verdict = guardProposal({ action: "open_job", kind: chain.request.kind, week: chain.request.week }, ctx.guard);
    if (verdict.allowed) return { action: "open_job", kind: chain.request.kind, ...(chain.request.week === undefined ? {} : { week: chain.request.week }) };
    return { action: "wait" };
  }
  const reason = chain.stop.reason;
  if (reason === "needs_approval") return { action: "ask_approval" };
  if (reason === "job_failed" || reason === "step_failed") return { action: "notify" };
  return { action: "wait" };
}

function llmFailure(error: unknown): string {
  return error instanceof LlmError ? `llm ${error.code}` : "llm beklenmeyen hata";
}

export async function decideDirector(ctx: DirectorContext, chain: ChainDecision, deps: DecideDeps): Promise<DirectorDecision> {
  const log = deps.log ?? (() => undefined);
  const fallback = (reason: string, llmCalled: boolean, meta?: LlmCallMeta): DirectorDecision => {
    log(`ajan yedeği: ${reason}`);
    const base = ctx.trigger === "chat" ? ({ action: "wait" } as const) : fallbackOf(chain, ctx);
    return { ...base, source: "fallback", fallbackReason: reason, llmCalled, ...(meta === undefined ? {} : { meta }) };
  };

  let output;
  let meta: LlmCallMeta;
  try {
    const result = await deps.llm.runJson({
      task: "llm_director",
      system: buildDirectorSystemPrompt(),
      input: buildDirectorInput(ctx),
      schema: DIRECTOR_OUTPUT_SCHEMA,
      timeoutMs: DIRECTOR_TIMEOUT_MS,
      model: deps.model,
    });
    output = result.value;
    meta = result.meta;
  } catch (error) {
    return fallback(llmFailure(error), true);
  }

  const verdict: GuardVerdict = guardProposal({ action: output.action, kind: output.kind, week: output.week }, ctx.guard);
  if (!verdict.allowed) return fallback(`kapı reddetti (${verdict.reason})`, true, meta);
  return {
    action: verdict.action,
    ...(verdict.kind === undefined ? {} : { kind: verdict.kind }),
    ...(verdict.week === undefined ? {} : { week: verdict.week }),
    ...(output.message === undefined ? {} : { message: output.message }),
    source: "llm",
    meta,
    llmCalled: true,
  };
}
