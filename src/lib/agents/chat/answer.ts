/**
 * Sohbet yanıtı akışı (HTTP'den bağımsız, test edilebilir): olgu paketini topla (`collectFacts`: yalnız `PanelRepository` OKUMA metotları)
 * → pakette hiç olgu yoksa LLM ÇAĞRILMADAN sabit "veri yok" yanıtı → LLM (`runJson`, araçsız Claude CLI; soru ve geçmiş veri bloğunda)
 * → kod doğrulaması (`review`, 1 düzeltme turu) → belirteçleri yerleştir + güveni hesapla (kanıt ve sayı güvenlerinin en zayıfı).
 * Doğrulamadan geçmemiş metin ASLA döndürülmez. Hata FIRLATILMAZ, `ok: false` sonucu olarak döner (kullanıcıya Türkçe kısa mesaj;
 * ayrıntı günlüğe). İş başlatmaz, veri yazmaz. Koşu kaydı çağıranındır (`handle.ts`): burada `llmCalled` ve `meta` döner.
 */
import "server-only";

import { collectFacts, type FactsContext, type FactsOptions } from "@/lib/agents/analyst/facts";
import type { BriefingFacts } from "@/lib/agents/analyst/facts-types";
import { itemConfidence } from "@/lib/agents/analyst/items";
import { replaceTokens } from "@/lib/agents/analyst/tokens";
import type { ChatErrorCode, ChatEvent, ChatStage } from "@/lib/agents/chat/events";
import { CHAT_ERROR_MESSAGE, CHAT_NO_DATA_TEXT } from "@/lib/agents/chat/messages";
import { loadChatWorkflow } from "@/lib/agents/chat/workflow";
import { buildChatInput, buildChatSystemPrompt } from "@/lib/agents/chat/prompt";
import type { ChatRequest } from "@/lib/agents/chat/request";
import { ChatAbortedError } from "@/lib/agents/chat/runner";
import { CHAT_OUTPUT_SCHEMA, type ChatCommand, type ChatOutput } from "@/lib/agents/chat/schema";
import { reviewChatOutput } from "@/lib/agents/chat/verify";
import type { BriefingEvidenceRef } from "@/lib/domain/briefing";
import { LlmError, type LlmBackend, type LlmCallMeta, type LlmErrorCode } from "@/lib/llm/types";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

/** Tek model çağrısının süre sınırı (ms). Toplam tavan çalıştırıcıdadır (`runner.ts`). */
export const CHAT_TIMEOUT_MS = 90_000;

export type ChatAnswerEvent = Extract<ChatEvent, { type: "answer" }>;

export type ChatResult =
  | { ok: true; answer: ChatAnswerEvent; meta?: LlmCallMeta; llmCalled: boolean; /** Kullanıcı bir iş yaptırmak (`delegate`; karar ajanın kapısındadır) ya da kendi fikrini kaydettirmek (`save_idea`, `idea` ile) istiyor; yalnız out_of_scope yanıtıyla. */ command?: ChatCommand; idea?: ChatOutput["idea"]; ticket?: ChatOutput["ticket"]; revision?: ChatOutput["revision"]; videoRevision?: ChatOutput["videoRevision"] }
  | { ok: false; code: ChatErrorCode; message: string; llmCalled: boolean; llmCode?: LlmErrorCode };

export interface ChatDeps {
  llm: LlmBackend;
  /** Model takma adı; verilmezse CLI varsayılanı. */
  model?: string;
  signal?: AbortSignal;
  onStage?: (stage: ChatStage) => void;
  /** Olgu paketi toplayıcı (test). */
  collect?: (ctx: FactsContext, options?: FactsOptions) => Promise<BriefingFacts>;
  log?: (line: string) => void;
}

const fail = (code: ChatErrorCode, llmCalled: boolean, llmCode?: LlmErrorCode): ChatResult => ({
  ok: false,
  code,
  message: CHAT_ERROR_MESSAGE[code],
  llmCalled,
  ...(llmCode === undefined ? {} : { llmCode }),
});

/** LLM hata kodu → kullanıcıya giden kod: CLI/yapılandırma sorunu = kullanılamıyor; süre; geçersiz yanıt = kanıtlı yanıt kurulamadı. */
function codeOfLlmError(error: LlmError): ChatErrorCode {
  switch (error.code) {
    case "spawn_failed":
    case "cli_failed":
    case "invalid_config":
    case "not_implemented":
      return "unavailable";
    case "timeout":
      return "timeout";
    case "invalid_output":
    case "envelope_invalid":
    case "output_too_large":
      return "no_evidence";
    case "invalid_input":
      return "failed";
  }
}

/** Doğrulanmış çıktıyı SON yanıta çevirir (saf): sayılar yerleştirilir, güven kodca hesaplanır; `answer` dışında kanıt/güven yoktur. */
export function placeChatAnswer(output: ChatOutput, facts: BriefingFacts): ChatAnswerEvent {
  const text = replaceTokens(output.text, facts.tokens);
  if (output.kind !== "answer") return { type: "answer", kind: output.kind, text, evidence: [] };
  const evidence = [...new Set(output.evidence)] as BriefingEvidenceRef[];
  return { type: "answer", kind: "answer", text, evidence, confidence: itemConfidence(evidence, output.text, facts) };
}

export async function answerChat(ctx: FactsContext, request: ChatRequest, deps: ChatDeps): Promise<ChatResult> {
  const log = deps.log ?? (() => undefined);

  deps.onStage?.("facts");
  let facts: BriefingFacts;
  try {
    // Harcama yönetici bilgisidir: pakete yalnız yönetici modunda girer (müşteri "bu ay ne harcandı?" diye sorsa yanıt kanıtsız kalır).
    facts = await (deps.collect ?? collectFacts)(ctx, { includeSpend: isOperatorMode() });
  } catch (error) {
    log(`olgu paketi kurulamadı: ${error instanceof Error ? error.name : "hata"}`);
    return fail("failed", false);
  }
  if (deps.signal?.aborted) return fail("aborted", false);

  // Hiç olgu yoksa (kanıt gösterilebilecek bir şey yok) LLM'e sormak yalnız uydurma riskidir: sabit yanıt.
  if (facts.refs.size === 0) return { ok: true, answer: { type: "answer", kind: "no_data", text: CHAT_NO_DATA_TEXT, evidence: [] }, llmCalled: false };

  deps.onStage?.("writing");
  const workflow = await loadChatWorkflow(ctx);
  try {
    const { value, meta } = await deps.llm.runJson({
      task: "llm_chat",
      system: buildChatSystemPrompt(facts.accountType),
      input: buildChatInput(facts, request.question, request.history, workflow),
      schema: CHAT_OUTPUT_SCHEMA,
      timeoutMs: CHAT_TIMEOUT_MS,
      model: deps.model,
      review: (output) => reviewChatOutput(output, facts),
      reviewFailure: "throw",
    });
    return { ok: true, answer: placeChatAnswer(value, facts), meta, llmCalled: true, ...(value.command === undefined ? {} : { command: value.command }), ...(value.idea === undefined ? {} : { idea: value.idea }), ...(value.ticket === undefined ? {} : { ticket: value.ticket }), ...(value.revision === undefined ? {} : { revision: value.revision }), ...(value.videoRevision === undefined ? {} : { videoRevision: value.videoRevision }) };
  } catch (error) {
    if (error instanceof ChatAbortedError) return fail("aborted", true);
    if (error instanceof LlmError) {
      log(`LLM hatası: ${error.code}`);
      return fail(codeOfLlmError(error), true, error.code);
    }
    log(`beklenmeyen hata: ${error instanceof Error ? error.name : "hata"}`);
    return fail("failed", true);
  }
}
