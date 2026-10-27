/**
 * Sohbetten fikir kaydı (`command: "save_idea"`): modelin önerdiği fikir sunucuda AYNI katı şemayla yeniden doğrulanır (`manual-idea-input.ts`),
 * çalışma alanı bağlamdan gelir (gövdeden değil) ve depo `createManualIdea` ile yazar. Hata FIRLATILMAZ: yanıta eklenecek tek cümle döner
 * (başarıda kayıt onayı, başarısızlıkta "kaydedemedim"; günlük sınır gibi depo kuralı kendi Türkçe mesajıyla). Fikir metni günlüğe yazılmaz.
 */
import "server-only";

import type { FactsContext } from "@/lib/agents/analyst/facts";
import { CHAT_IDEA_NOT_SAVED_TEXT, chatIdeaSavedText } from "@/lib/agents/chat/messages";
import { parseManualIdea } from "@/lib/data/manual-idea-input";
import { RepositoryError } from "@/lib/data/repository";

export async function saveChatIdea(ctx: FactsContext, idea: unknown, log?: (line: string) => void): Promise<string> {
  try {
    const value = parseManualIdea(idea);
    const saved = await ctx.repo.createManualIdea(ctx.workspaceId, value, ctx.now);
    return chatIdeaSavedText(saved.title);
  } catch (error) {
    log?.(`fikir kaydedilemedi: ${error instanceof RepositoryError ? error.code : "hata"}`);
    return error instanceof RepositoryError && error.code === "invalid_state" ? error.message : CHAT_IDEA_NOT_SAVED_TEXT;
  }
}
