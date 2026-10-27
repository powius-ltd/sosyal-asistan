import type { Competitor } from "@/lib/domain/competitor";

/**
 * Toplamanın rakibi gizli/bulunamadı yapma sebebi (`Competitor.statusReason`, kısa Türkçe metin) satırda okunur hale gelir:
 * ilk harf büyütülür, sonuna nokta konur. Sebep yoksa ya da boşsa undefined (satırda sebep satırı çizilmez).
 */
export function statusReasonText(competitor: Pick<Competitor, "statusReason">): string | undefined {
  const reason = competitor.statusReason?.trim();
  if (!reason) return undefined;
  const sentence = reason.charAt(0).toLocaleUpperCase("tr-TR") + reason.slice(1);
  return /[.!?…]$/.test(sentence) ? sentence : `${sentence}.`;
}
