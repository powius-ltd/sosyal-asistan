/**
 * Stüdyo videosunun açıklamasına YZ beyanı: şu an HİÇBİR stüdyo türü YZ ile üretilmiş sayılmaz (animasyon / b-roll /
 * anlatım kodla kurulur, ses seslendirmedir, UGC gerçek kişiyle çekilir; kullanıcı kararı 2026-10-29: `AI_GENERATED_ORDER_KINDS` boş).
 * İleride YZ türü eklenirse listeye girer; o videoda beyan yoksa
 * dönüşte açıklamanın sonuna TEK satır eklenir; böylece video `draft`'ta takılmaz, onay kartına düşer. Beyan zaten varsa açıklama
 * değişmez. Denetim uyum motorunun kendi kuralıyla (`tr.ai-disclosure`) yapılır: desen kopyalanmaz.
 */
import { checkCompliance } from "@/lib/compliance";

export const AI_DISCLOSURE_LINE = "Yapay zekâ ile üretildi.";

export function withAiDisclosure(caption: string): string {
  const result = checkCompliance({ caption, isPaidPartnership: false, isAiGenerated: true, region: "TR" });
  if (!result.findings.some((f) => f.ruleId === "tr.ai-disclosure")) return caption;
  return `${caption.trimEnd()}\n\n${AI_DISCLOSURE_LINE}`;
}

/** YZ ile üretilmiş sayılan stüdyo türleri: şimdilik yok (UGC gerçek kişi, animasyon kod). */
export const AI_GENERATED_ORDER_KINDS: readonly string[] = [];

/** Stüdyo fişinin türü YZ üretimi mi (`AI_GENERATED_ORDER_KINDS`). Tür yoksa hayır. */
export function isAiGeneratedOrder(kind: string | undefined): boolean {
  return kind !== undefined && AI_GENERATED_ORDER_KINDS.includes(kind);
}
