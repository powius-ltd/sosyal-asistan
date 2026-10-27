/**
 * `brief:now` orkestrasyonu (Analist brifingi): olgu paketini topla → LLM (mevcut `LlmBackend.runJson`, 1 abonelik çağrısı) → kod doğrulaması
 * (`review`, 1 düzeltme turu) → sayıları yerleştir + güveni hesapla → `agent_briefings`'e YAZ + `collection_runs` kaydı (billing subscription).
 * BAŞARISIZLIKTA brifing YAZILMAZ: önceki brifing kalır (ekranda bayat işaretlenir); başarısız koşu satırı yazılır. LLM/çıktı hatası
 * FIRLATILMAZ, `ok: false` sonucu olarak döner (rutin bir sonraki adıma geçebilsin: `persistent` = kalıcı CLI hatası, sonraki LLM adımları
 * denenmez). Veri okuma/DB hatası ve çağıran hatası (`invalid_input`/`invalid_config`) fırlar. Plan: `docs/AJAN-PLAN.md` §2.
 */
import "server-only";

import { collectFacts } from "@/lib/agents/analyst/facts";
import type { FactSection } from "@/lib/agents/analyst/facts-types";
import { buildBriefingItems } from "@/lib/agents/analyst/items";
import { ANALYST_PROMPT_VERSION, buildAnalystInput, buildAnalystSystemPrompt } from "@/lib/agents/analyst/prompt";
import { ANALYST_OUTPUT_SCHEMA } from "@/lib/agents/analyst/schema";
import { reviewAnalystOutput } from "@/lib/agents/analyst/verify";
import { PERSONA_VERSION } from "@/lib/agents/persona";
import type { BriefingBasis, BriefingItem } from "@/lib/domain/briefing";
import type { IntelContext } from "@/lib/intel/context";
import { saveBriefing, toBriefingRow } from "@/lib/intel/briefing-store";
import { closeRun, openSubscriptionRun, recordFailedLlmRun } from "@/lib/intel/run-log";
import { createLlmBackend } from "@/lib/llm/backend";
import { LlmError, RUN_PROVIDER_OF_BACKEND, type LlmBackend, type LlmErrorCode } from "@/lib/llm/types";

export const BRIEFING_RUN_KIND = "llm_briefing" as const;
const BRIEFING_TIMEOUT_MS = 240_000;
/** Bir kez olunca sonraki LLM adımlarında da olacak hatalar (CLI yok/oturum yok/limit dolu). */
const PERSISTENT_ERRORS: readonly string[] = ["spawn_failed", "cli_failed"];
/** Çağıranın hatası: sonuca çevrilmez, olduğu gibi fırlar. */
const CALLER_ERRORS: readonly string[] = ["invalid_input", "invalid_config", "not_implemented"];

export interface BriefingRunOptions {
  /** LLM arka ucu (test/enjeksiyon); verilmezse `createLlmBackend()`. */
  llm?: LlmBackend;
  /** Model takma adı; verilmezse CLI varsayılanı. */
  model?: string;
  /** Olgu paketi bayt sınırı (test). */
  maxBytes?: number;
  log?: (line: string) => void;
}

export type BriefingRunResult =
  | {
      ok: true;
      briefingId: string;
      /** Üreten `collection_runs` satırı. */
      runId: string;
      items: BriefingItem[];
      basis: BriefingBasis;
      model?: string;
      /** Model çağrısı sayısı: 1 = ilk yanıt geçerli, 2 = düzeltme turu. */
      attempts: number;
      seconds: number;
      factsBytes: number;
      omitted: Partial<Record<FactSection, number>>;
    }
  | {
      ok: false;
      code: LlmErrorCode | "write_failed";
      message: string;
      /** Kalıcı hata (CLI yok/oturum yok): sonraki LLM adımları denenmez. */
      persistent: boolean;
      seconds: number;
    };

const seconds = (t0: number) => Math.round((performance.now() - t0) / 100) / 10;

/** Brifingi üretir ve yazar. İmza `(ctx, options?) → BriefingRunResult`: rutin enjekte edebilir. */
export async function runBriefing(ctx: IntelContext, options: BriefingRunOptions = {}): Promise<BriefingRunResult> {
  const t0 = performance.now();
  const log = options.log ?? (() => undefined);
  const targetLabel = "brifing (Analist)";

  const facts = await collectFacts(ctx, { maxBytes: options.maxBytes });
  log(`Hesap türü: ${facts.pack.account.type} · rakip ${facts.pack.account.hasRivals ? "izleniyor" : "YOK"}.`);
  log(`Olgu paketi: ${facts.bytes} bayt, ${facts.refs.size} olgu, ${facts.actions.size} eylem${Object.keys(facts.omitted).length > 0 ? `, kırpılan ${JSON.stringify(facts.omitted)}` : ""}.`);

  const llm = options.llm ?? createLlmBackend();
  let result;
  try {
    result = await llm.runJson({
      task: BRIEFING_RUN_KIND,
      system: buildAnalystSystemPrompt(facts.accountType),
      input: buildAnalystInput(facts),
      schema: ANALYST_OUTPUT_SCHEMA,
      timeoutMs: BRIEFING_TIMEOUT_MS,
      model: options.model,
      review: (output) => reviewAnalystOutput(output, facts),
      reviewFailure: "throw",
    });
  } catch (error) {
    if (!(error instanceof LlmError) || CALLER_ERRORS.includes(error.code)) throw error;
    await recordFailedLlmRun(ctx.client, ctx.workspaceId, BRIEFING_RUN_KIND, targetLabel, error.message);
    return { ok: false, code: error.code, message: error.message, persistent: PERSISTENT_ERRORS.includes(error.code), seconds: seconds(t0) };
  }

  const { value, meta } = result;
  const provider = RUN_PROVIDER_OF_BACKEND[meta.backend];
  if (provider !== "claude_cli") throw new Error("Yalnız abonelik (claude_cli) LLM çağrıları bu betikte kaydedilir.");
  // Koşu satırı LLM başarılı olduktan sonra açılır ve YAZIM bitince kapanır: yazım düşerse satır başarısız kapanır.
  const run = await openSubscriptionRun(ctx.client, ctx.workspaceId, provider, BRIEFING_RUN_KIND, targetLabel);
  try {
    const items = buildBriefingItems(value, facts);
    const row = toBriefingRow({
      workspaceId: ctx.workspaceId,
      items,
      basis: facts.basis,
      promptVersion: ANALYST_PROMPT_VERSION,
      personaVersion: PERSONA_VERSION,
      model: meta.model,
      runId: run.id,
      now: ctx.now,
    });
    const briefingId = await saveBriefing(ctx.client, row);
    await closeRun(ctx.client, run.id, { ok: true, itemCount: items.length, inputTokens: meta.usage?.inputTokens, outputTokens: meta.usage?.outputTokens, model: meta.model });
    return {
      ok: true,
      briefingId,
      runId: run.id,
      items,
      basis: facts.basis,
      ...(meta.model === undefined ? {} : { model: meta.model }),
      attempts: meta.attempts,
      seconds: seconds(t0),
      factsBytes: facts.bytes,
      omitted: facts.omitted,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "bilinmeyen hata";
    await closeRun(ctx.client, run.id, { ok: false, error: message, inputTokens: meta.usage?.inputTokens, outputTokens: meta.usage?.outputTokens, model: meta.model });
    return { ok: false, code: "write_failed", message, persistent: false, seconds: seconds(t0) };
  }
}
