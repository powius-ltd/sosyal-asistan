/**
 * Sohbet emrinin tek cümlelik sonuç metni (saf; düz dil, tutar ve iç terim yok). Başlattıysa ne başlattığını ve nereden iptal edileceğini söyler.
 */
import type { DirectorTurnResult } from "@/lib/agents/director/turn";
import { JOB_KIND_PLAIN } from "@/lib/plain-language";

export function chatDelegateText(result: DirectorTurnResult): string {
  const { outcome, decision } = result;
  if (outcome === "requested" && decision?.kind !== undefined) return `Başlattım: ${JOB_KIND_PLAIN[decision.kind].label}. İptal: İşler ekranından.`;
  if (outcome === "busy" || outcome === "waiting") return "Şu an süren bir iş var; bitince sıradakine bakarım.";
  if (outcome === "refused") return "Bu işi şu an başlatamadım; İşler ekranına bakabilirsin.";
  if (decision?.action === "notify" || decision?.action === "ask_approval") {
    return decision.message !== undefined && decision.message !== "" ? decision.message : "Bunu ancak sen yapabilirsin; ben yalnız halkanın işlerini açarım.";
  }
  return "Şu an bunun için açabileceğim bir iş görmüyorum.";
}
