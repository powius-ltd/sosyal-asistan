/**
 * Arka uç seçimi: `LLM_BACKEND=claude_cli` (varsayılan; yerel abonelik) ya da `anthropic_api` (deploy; şimdilik saplama).
 * Görevler `LlmBackend` alır; bu fabrika betik/action başında bir kez çağrılır. Geçersiz değer sessizce varsayılana DÜŞMEZ
 * (yanlış yazılmış bir ortam değişkeni yanlış arka uca gitmesin): `invalid_config`.
 */
import "server-only";

import { createAnthropicApiBackend } from "@/lib/llm/anthropic-api";
import { createClaudeCliBackend, type ClaudeCliDeps } from "@/lib/llm/claude-cli";
import { LLM_BACKEND_IDS, LlmError, type LlmBackend, type LlmBackendId } from "@/lib/llm/types";

export const DEFAULT_LLM_BACKEND: LlmBackendId = "claude_cli";

export function resolveBackendId(value: string | undefined): LlmBackendId {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === "") return DEFAULT_LLM_BACKEND;
  const found = LLM_BACKEND_IDS.find((id) => id === trimmed);
  if (found === undefined) throw new LlmError("invalid_config", `LLM_BACKEND geçersiz: "${trimmed}" (geçerli: ${LLM_BACKEND_IDS.join(", ")}).`);
  return found;
}

export interface CreateLlmBackendOptions {
  /** Ortam değişkenleri (varsayılan `process.env`); `LLM_BACKEND` ve `CLAUDE_CLI_PATH` buradan okunur. */
  env?: Record<string, string | undefined>;
  /** Claude CLI bağımlılıkları (test/özelleştirme); `env` buraya da geçer. */
  claude?: ClaudeCliDeps;
}

export function createLlmBackend(options: CreateLlmBackendOptions = {}): LlmBackend {
  const env = options.env ?? process.env;
  const id = resolveBackendId(env.LLM_BACKEND);
  return id === "anthropic_api" ? createAnthropicApiBackend() : createClaudeCliBackend({ env, ...options.claude });
}
