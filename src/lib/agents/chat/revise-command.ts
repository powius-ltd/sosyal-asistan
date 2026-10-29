/**
 * Sohbetten fikir düzeltme (`revise_idea`, SPN-35). Model yalnız ÖNERİR (fikir kimliği + istek); burada sunucu doğrular: fikir bu çalışma
 * alanında ve BU HAFTANIN planında mı (`workflow.ts`; uydurma / yabancı kimlik reddedilir). Yeniden yazım, denetim ve kayıt
 * `lib/ideas/revise.ts`'tedir (sayfa dışı tek yol). Sohbet planı ONAYLAMAZ: onay yalnız plan sayfasındaki düğmedir.
 * Hata FIRLATILMAZ: yanıta eklenecek tek düz Türkçe cümle döner.
 */
import "server-only";

import type { FactsContext } from "@/lib/agents/analyst/facts";
import type { ChatOutput } from "@/lib/agents/chat/schema";
import { loadChatWorkflow } from "@/lib/agents/chat/workflow";
import { reviseIdeaFromRequest, type ReviseResult } from "@/lib/ideas/revise";
import type { LlmBackend } from "@/lib/llm/types";
import { REVISE_PLAIN } from "@/lib/plain-language-revise";

export async function runChatReviseCommand(ctx: FactsContext, backend: LlmBackend, revision: NonNullable<ChatOutput["revision"]>, log?: (line: string) => void): Promise<ReviseResult> {
  const workflow = await loadChatWorkflow(ctx);
  if (!workflow.ideas.some((idea) => idea.id === revision.ideaId)) return { ok: false, message: REVISE_PLAIN.notInPlan };
  return reviseIdeaFromRequest(ctx, backend, revision.ideaId, revision.request, log);
}
