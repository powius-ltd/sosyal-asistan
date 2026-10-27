/**
 * agy `--output-format json` zarfı (agy 1.2.14, gerçek çağrıda ölçüldü):
 *   { conversation_id, status: "SUCCESS", response: "<JSON metni>", duration_seconds, num_turns,
 *     structured_output: { …şemaya uyan nesne… }, json_schema: { … }, usage: { input_tokens, output_tokens, thinking_tokens, total_tokens, … } }
 * `--json-schema` verilince `structured_output` doğrudan nesnedir (öncelikli); yoksa `response` metnidir (çitli olabilir). Zarf hiç yoksa
 * stdout'un kendisi yanıt sayılır. Yanıt içeriği ne olursa olsun sonradan zod doğrular (`agy-analysis.ts`); burası yalnız kabuğu açar.
 */
import "server-only";

import { extractJson } from "@/lib/llm/json-extract";

export interface AgyUsage {
  /** Giriş token'ı (istem + video). */
  inputTokens?: number;
  /** Çıkış token'ı; düşünme (thinking) token'larını da içerir (toplam = giriş + çıkış; gerçek zarfta doğrulandı). */
  outputTokens?: number;
  totalTokens?: number;
  thinkingTokens?: number;
}

export interface AgyEnvelope {
  /** Şemaya uyması beklenen yük: nesne (`structured_output`) ya da metin (`response` / ham stdout). */
  payload: unknown;
  usage: AgyUsage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const count = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);

function readUsage(raw: unknown): AgyUsage {
  if (!isRecord(raw)) return {};
  const inputTokens = count(raw.input_tokens);
  const outputTokens = count(raw.output_tokens);
  const totalTokens = count(raw.total_tokens);
  const thinkingTokens = count(raw.thinking_tokens);
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(thinkingTokens === undefined ? {} : { thinkingTokens }),
  };
}

export function readAgyEnvelope(stdout: string): AgyEnvelope {
  const extracted = extractJson(stdout);
  if (extracted.ok && isRecord(extracted.value) && ("structured_output" in extracted.value || "response" in extracted.value)) {
    const envelope = extracted.value;
    return { payload: isRecord(envelope.structured_output) ? envelope.structured_output : envelope.response, usage: readUsage(envelope.usage) };
  }
  return { payload: stdout, usage: {} };
}
