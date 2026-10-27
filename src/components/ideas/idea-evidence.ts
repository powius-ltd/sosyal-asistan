import type { Idea, IdeaEvidence } from "@/lib/domain/intel";

/** Kanıt videoların (`ok` analizli olanların) hook türleri, tekrarsız. */
export function collectHookTypes(evidence: readonly Pick<IdeaEvidence, "hookType">[]): string[] {
  return [...new Set(evidence.flatMap((e) => (e.hookType ? [e.hookType] : [])))];
}

/**
 * Fikir kartındaki hook türleri: depo `idea.hookType` verdiyse yalnız o. Vermediyse (eski/eksik kayıt)
 * tek yedek olarak kanıt özetlerindeki hook türlerinden türetilir — türetme başka yerde yapılmaz.
 */
export function ideaHookTypes(idea: Pick<Idea, "hookType">, evidence: readonly Pick<IdeaEvidence, "hookType">[]): string[] {
  return idea.hookType ? [idea.hookType] : collectHookTypes(evidence);
}

/** Bağlantı metni: kanıt özetindeki alt yazı (depo kısaltır); yoksa "@hesap içeriği". */
export function evidenceTitle(evidence: Pick<IdeaEvidence, "caption" | "ownerHandle">): string {
  return evidence.caption?.trim() || `@${evidence.ownerHandle} içeriği`;
}
