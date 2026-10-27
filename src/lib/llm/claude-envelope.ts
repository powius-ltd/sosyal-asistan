/**
 * Claude CLI JSON zarfını okur (`claude -p --output-format json`). Gerçek çağrıda (2.1.284) gözlenen şekil:
 *   { type: "result", subtype: "success", is_error: false, result: "<JSON metni>", structured_output: { … },
 *     total_cost_usd, duration_ms, num_turns, usage: { input_tokens, cache_creation_input_tokens, cache_read_input_tokens,
 *     output_tokens, … }, modelUsage: { "<model>[1m]": { canonicalModel, … } } }
 * `--json-schema` verildiğinde yanıt `structured_output`'ta hazır nesne olarak gelir; yoksa `result` metnine (çitli olabilir) düşülür.
 * Sürümler arası farka dayanıklı: zarf tek nesne ya da dizi olabilir (sonuncu `type: "result"` alınır); alanlar isteğe bağlıdır.
 * Hata zarfı: `is_error: true` ya da `subtype` "error…" ile başlar (ileti `result`'tadır).
 */
import "server-only";

import type { LlmUsage } from "@/lib/llm/types";
import { LlmError } from "@/lib/llm/types";

export interface ClaudeEnvelope {
  isError: boolean;
  subtype?: string;
  /** `structured_output` (varsa). */
  structured?: unknown;
  /** `result` metni (hata iletisi ya da yapılandırılmış olmayan yanıt). */
  resultText?: string;
  costUsd?: number;
  usage?: LlmUsage;
  model?: string;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const asNumber = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

function readUsage(usage: Record<string, unknown> | undefined): LlmUsage | undefined {
  if (!usage) return undefined;
  const input = asNumber(usage.input_tokens);
  const output = asNumber(usage.output_tokens);
  if (input === undefined && output === undefined) return undefined;
  return {
    inputTokens: (input ?? 0) + (asNumber(usage.cache_read_input_tokens) ?? 0) + (asNumber(usage.cache_creation_input_tokens) ?? 0),
    outputTokens: output ?? 0,
  };
}

/** `modelUsage` anahtarlarından ilk modelin adı ("claude-opus-5-5[1m]" → `canonicalModel` ya da köşeli ek atılmış ad). */
function readModel(modelUsage: Record<string, unknown> | undefined): string | undefined {
  if (!modelUsage) return undefined;
  const [key] = Object.keys(modelUsage);
  if (key === undefined) return undefined;
  const canonical = asRecord(modelUsage[key])?.canonicalModel;
  return typeof canonical === "string" && canonical !== "" ? canonical : key.replace(/\[[^\]]*\]$/, "");
}

/** stdout'tan zarfı okur; okunamazsa `LlmError("envelope_invalid")`. */
export function parseClaudeEnvelope(stdout: string): ClaudeEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.replace(/^﻿/, "").trim());
  } catch {
    throw new LlmError("envelope_invalid", "Claude CLI çıktısı JSON değil (zarf okunamadı).");
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const record = [...list].reverse().map(asRecord).find((item) => item?.type === "result") ?? (list.length === 1 ? asRecord(list[0]) : undefined);
  if (!record || record.type !== "result") throw new LlmError("envelope_invalid", "Claude CLI zarfında sonuç (type: result) yok.");

  const subtype = typeof record.subtype === "string" ? record.subtype : undefined;
  return {
    isError: record.is_error === true || (subtype !== undefined && subtype.startsWith("error")),
    subtype,
    structured: record.structured_output ?? undefined,
    resultText: typeof record.result === "string" ? record.result : undefined,
    costUsd: asNumber(record.total_cost_usd),
    usage: readUsage(asRecord(record.usage)),
    model: readModel(asRecord(record.modelUsage)),
  };
}
