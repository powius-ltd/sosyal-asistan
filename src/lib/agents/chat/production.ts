/**
 * Sohbet işleyicisinin gerçek bağımlılıkları (route dosyası yalnız `POST` ve yapılandırma dışa aktarabilir; bağlama burada). Çalışma alanı,
 * depo ve saat `getPanelContext()`'ten gelir; LLM arka ucu `createLlmBackend` ile kurulur ve alt süreç çalıştırıcısı istek başına
 * süre tavanı + iptal sarmalayıcısına (`runner.ts`) verilir. Koşu kaydı yalnız Supabase veri kaynağında yazılır (örnek veride kayıt
 * atlanır: service role/DB yok).
 */
import "server-only";

import { chatAvailability } from "@/lib/agents/chat/availability";
import type { ChatHandlerDeps } from "@/lib/agents/chat/handle";
import { chatLock } from "@/lib/agents/chat/lock";
import { createSupabaseRunRecorder, NOOP_RUN_RECORDER, type ChatRunRecorder } from "@/lib/agents/chat/run-record";
import { createChatRunner } from "@/lib/agents/chat/runner";
import { chatDelegateText } from "@/lib/agents/director/chat-text";
import { runDirectorTurn } from "@/lib/agents/director/turn";
import { getDataSource, getPanelContext } from "@/lib/data";
import { jobsGate } from "@/lib/job-control/gate";
import { getAdminClient } from "@/lib/supabase/admin";
import { listWorkspaces } from "@/lib/workspace/registry";
import { createLlmBackend } from "@/lib/llm/backend";
import { runSubprocess } from "@/lib/llm/subprocess";

/** Kaydediciyi istek anında seçer (veri kaynağı env'den okunur; geçersiz değer burada değil kayıt anında hata verir). */
function lazyRecorder(): ChatRunRecorder {
  const pick = (): ChatRunRecorder => (getDataSource() === "supabase" ? createSupabaseRunRecorder() : NOOP_RUN_RECORDER);
  return {
    succeeded: (workspaceId, meta) => pick().succeeded(workspaceId, meta),
    failed: (workspaceId, reason) => pick().failed(workspaceId, reason),
  };
}

export function productionChatDeps(): ChatHandlerDeps {
  return {
    availability: () => chatAvailability(),
    getContext: async () => {
      const { repo, wsId, now } = await getPanelContext();
      return { repo, workspaceId: wsId, now };
    },
    createBackend: ({ signal, totalMs }) => createLlmBackend({ claude: { run: createChatRunner({ base: runSubprocess, signal, totalMs }) } }),
    panelSlug: async (workspaceId) => (await listWorkspaces()).find((w) => w.id === workspaceId)?.slug,
    recorder: lazyRecorder(),
    lock: chatLock,
    // İş yaptırma yalnız işler açıkken (`jobsGate`: yönetici modu + gerçek veri + işçi betiği); kapalıyken undefined → sohbet salt okunur kalır.
    delegate: async ({ workspaceId }, instruction) => {
      if (!jobsGate().open) return undefined;
      const result = await runDirectorTurn({ client: getAdminClient(), workspaceId, now: new Date(), env: process.env, trigger: "chat", instruction });
      return chatDelegateText(result);
    },
    log: (line) => console.error(`[sohbet] ${line}`),
    info: (line) => console.info(`[sohbet] ${line}`),
  };
}
