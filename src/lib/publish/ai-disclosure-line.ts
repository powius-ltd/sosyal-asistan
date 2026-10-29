/**
 * Stüdyo videosunun açıklamasına YZ beyanı: stüdyo videosu her zaman yapay zekâ ile üretilmiştir (`aiGenerated: true`), beyan yoksa
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
