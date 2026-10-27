/**
 * Yalnız testler için: görev testlerinin kullandığı sahte LLM arka ucu (üretim koduna girmez). GERÇEK `runClaudeJson`'ı sahte alt
 * süreçle çalıştırır: zarf okuma, şema doğrulaması, `review` ve düzeltme turu üretimdeki gibi işler; yalnız "model" yanıtı hazırdır.
 * Yanıt bir işlev de olabilir (stdin girdisine göre cevap); liste bittiyse son yanıt tekrar kullanılır.
 */
import { createClaudeCliBackend } from "@/lib/llm/claude-cli";
import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";
import type { SubprocessOptions } from "@/lib/llm/subprocess";
import type { LlmBackend } from "@/lib/llm/types";

export type FakeModelOutput = unknown | ((stdin: string) => unknown);

export interface FakeLlm {
  backend: LlmBackend;
  /** Yapılan model çağrıları (stdin girdisi `input`'ta). */
  calls: SubprocessOptions[];
}

export function createFakeLlm(...outputs: FakeModelOutput[]): FakeLlm {
  const fake = createFakeSubprocess(
    ...outputs.map((output) => (options: SubprocessOptions) => {
      const value = typeof output === "function" ? (output as (stdin: string) => unknown)(options.input ?? "") : output;
      return {
        stdout: JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: false,
          result: JSON.stringify(value),
          structured_output: value,
          total_cost_usd: 0.01,
          usage: { input_tokens: 10, output_tokens: 20 },
          modelUsage: { "claude-test[1m]": { canonicalModel: "claude-test" } },
        }),
      };
    }),
  );
  return { backend: createClaudeCliBackend({ run: fake.runner, env: {} }), calls: fake.calls };
}
