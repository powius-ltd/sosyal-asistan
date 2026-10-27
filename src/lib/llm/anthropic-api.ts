/**
 * Claude API arka ucu (deploy ortamı için): ŞİMDİLİK SAPLAMA. Müşteri işinde (Anthropic SDK + `collection_runs` metered
 * faturalama + bütçe rezervi) yazılacak; o zamana kadar her çağrı `not_implemented` verir ve yerel geliştirme Claude CLI'da kalır
 * (`LLM_BACKEND=claude_cli`, varsayılan). Arayüz (`LlmBackend`) değişmez: görevler bu değişimden etkilenmez.
 */
import "server-only";

import { LlmError, type LlmBackend } from "@/lib/llm/types";

export function createAnthropicApiBackend(): LlmBackend {
  return {
    id: "anthropic_api",
    runJson: async () => {
      throw new LlmError("not_implemented", "anthropic_api arka ucu henüz yazılmadı (müşteri işinde yapılacak); LLM_BACKEND=claude_cli kullan.");
    },
  };
}
