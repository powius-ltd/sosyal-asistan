/**
 * Hesap sahibinin önerileri: sohbetten kaydettirdiği (`source = manual`) ve henüz işlenmemiş (`status = new`) fikirler; haftalık plan üretimi
 * bunları fikir istemine veri bloğu olarak verir (`generate-ideas.ts` `ownerSuggestions`). En yeni `OWNER_SUGGESTIONS_MAX` tanesi alınır.
 * Okuma salt okunurdur (kuru koşuda da çalışır). Elle fikir plan yeniden üretiminde silinmez (0025), bu yüzden bir sonraki turda da görünür
 * kalır; sahibi kapatana (`dismissed`) ya da kaydedene kadar öneri sayılır.
 */
import type { Idea } from "@/lib/domain/intel";
import { MAX_PAGE_LIMIT } from "@/lib/data/queries";
import type { PanelRepository } from "@/lib/data/repository";

export const OWNER_SUGGESTIONS_MAX = 10;

export interface OwnerSuggestion {
  title: string;
  note: string;
}

/** Saf seçim: elle + yeni fikirler, en yeni önce, en çok `max`. */
export function pickOwnerSuggestions(ideas: readonly Idea[], max: number = OWNER_SUGGESTIONS_MAX): OwnerSuggestion[] {
  return ideas
    .filter((idea) => idea.source === "manual" && idea.status === "new")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, max)
    .map((idea) => ({ title: idea.title, note: idea.rationale }));
}

export async function loadOwnerSuggestions(repo: PanelRepository, workspaceId: string): Promise<OwnerSuggestion[]> {
  return pickOwnerSuggestions(await repo.listIdeas(workspaceId, { status: "new", limit: MAX_PAGE_LIMIT }));
}

/** Plan notu: kaç elle fikir girdi (0 ise not yok). */
export function ownerSuggestionsNote(count: number): string | undefined {
  return count === 0 ? undefined : `Hesap sahibinin ${count} elle fikri girdi olarak verildi (uygun olan plana uyarlanabilir, zorunlu değil).`;
}
