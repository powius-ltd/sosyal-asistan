/**
 * Kanıt raporu (`EvidenceReport`) için ekran metinleri ve alıntı işaretleme yardımcısı. Denetim kuralı `lib/intel/evidence.ts`'te
 * yaşar ve sıralıdır; burada yalnız sonucun Türkçe gösterimi vardır.
 */
import { HOOK_SOURCE_LABEL, type EvidenceFailure, type EvidenceReport, type EvidenceTarget } from "@/lib/domain/intel";
import { sectionTypeLabel, labelKeyLabel } from "@/components/video/taxonomy-labels";

export const EVIDENCE_FAILURE_LABEL: Record<EvidenceFailure, string> = {
  empty: "Alıntı boş",
  too_short: "Alıntı çok kısa (en az 2 kelime olmalı)",
  too_long: "Alıntı çok uzun (açılış en çok 200 karakter)",
  not_found: "Konuşma, ekran yazısı ya da açıklamada birebir bulunamadı",
  outside_first_quarter: "Açılış konuşmanın ilk %25'inde değil",
};

/** Denetlenen şeyin Türkçe adı: "Açılış", "Açılış tarzı", "Bölüm: Hikaye", "Etiket: Konu". */
export function evidenceTargetLabel(target: EvidenceTarget, key?: string): string {
  if (target === "hook") return "Açılış";
  if (target === "hook_type") return "Açılış tarzı";
  if (target === "section") return key ? `Bölüm: ${sectionTypeLabel(key)}` : "Bölüm";
  return key ? `Etiket: ${labelKeyLabel(key)}` : "Etiket";
}

/** Kanal adı (hook kanalı ve bulunan alıntıların kanalı). */
export const EVIDENCE_CHANNEL_LABEL = HOOK_SOURCE_LABEL;

/**
 * Bu alıntı kanıt denetiminde BAŞARISIZ olanlardan mı? Rapor yoksa (eski analiz) bilinmez → false; genel uyarı yine
 * `evidenceVerified` ile gösterilir. Eşleşme hedef + alıntı metnidir (aynı alıntı iki yerde geçerse ikisi de işaretlenir).
 */
export function isQuoteUnverified(report: EvidenceReport | undefined, target: EvidenceTarget, quote: string): boolean {
  if (!report) return false;
  return report.failures.some((failure) => failure.target === target && failure.quote === quote);
}
