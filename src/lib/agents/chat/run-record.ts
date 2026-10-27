/**
 * Sohbet koşu kaydı: soru başına BİR `collection_runs` satırı (`kind: llm_chat`, `billing: subscription`, tutar yok; `openSubscriptionRun`
 * / `closeRun` / `recordFailedLlmRun` deseni, brifingle aynı). SORU METNİ ve yanıt YAZILMAZ: hedef etiketi sabit "sohbet", hata metni
 * yalnız kod. Örnek (mock) veri kaynağında kayıt YOKTUR (service role/Supabase gerekir): `NOOP_RUN_RECORDER`. Kayıt hatası yanıtı
 * bozmaz (çağıran yakalar).
 */
import "server-only";

import { closeRun, openSubscriptionRun, recordFailedLlmRun } from "@/lib/intel/run-log";
import { RUN_PROVIDER_OF_BACKEND, type LlmCallMeta } from "@/lib/llm/types";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";

export const CHAT_RUN_KIND = "llm_chat" as const;
export const CHAT_RUN_LABEL = "sohbet";

export interface ChatRunRecorder {
  /** Başarılı çağrı (yanıt ya da `no_data`/`out_of_scope` yanıtı üretildi): jeton sayılarıyla tek satır. */
  succeeded(workspaceId: string, meta: LlmCallMeta): Promise<void>;
  /** Başarısız/iptal çağrı: `reason` yalnız kısa kod (soru metni değil). */
  failed(workspaceId: string, reason: string): Promise<void>;
}

export const NOOP_RUN_RECORDER: ChatRunRecorder = {
  succeeded: async () => undefined,
  failed: async () => undefined,
};

export function createSupabaseRunRecorder(getClient: () => AdminClient = getAdminClient): ChatRunRecorder {
  return {
    async succeeded(workspaceId, meta) {
      const provider = RUN_PROVIDER_OF_BACKEND[meta.backend];
      if (provider !== "claude_cli") throw new Error("Yalnız abonelik (claude_cli) LLM çağrıları kaydedilir.");
      const client = getClient();
      const run = await openSubscriptionRun(client, workspaceId, provider, CHAT_RUN_KIND, CHAT_RUN_LABEL);
      await closeRun(client, run.id, { ok: true, itemCount: 1, inputTokens: meta.usage?.inputTokens, outputTokens: meta.usage?.outputTokens, model: meta.model });
    },
    async failed(workspaceId, reason) {
      await recordFailedLlmRun(getClient(), workspaceId, CHAT_RUN_KIND, CHAT_RUN_LABEL, reason);
    },
  };
}
