/**
 * Prompt "Kısıtlar" bölümü için uyum hatırlatması. Kural metni KOPYALANMAZ: `checkCompliance` (`lib/compliance`) boş
 * açıklamayla, ücretli iş birliği / YZ üretimi işaretli iki girdiyle çağrılır ve dönen bulgunun cümlesi (ne gerekiyor +
 * nasıl düzeltilir) kullanılır. Böylece kural değişince prompt da değişir. Hukuki tavsiye değildir.
 */
import { checkCompliance } from "@/lib/compliance";
import type { ComplianceFinding, ComplianceRegion } from "@/lib/domain/compliance";
import { promptStrings } from "@/lib/prompt/strings";
import type { PromptLanguage } from "@/lib/prompt/types";

/** Bulgunun tek satırlık hatırlatma cümlesi: gereksinim + (varsa) düzeltme ipucu. */
function reminder(finding: ComplianceFinding): string {
  return finding.hint ? `${finding.message} ${finding.hint}` : finding.message;
}

/** Bölgenin kurallarından, boş açıklamada bulgu veren ("eksik ibare") kuralların hatırlatmaları. */
function findingsFor(region: ComplianceRegion, flags: { paid: boolean; ai: boolean }): string[] {
  const result = checkCompliance({
    caption: "",
    isPaidPartnership: flags.paid,
    isAiGenerated: flags.ai,
    region,
  });
  return result.findings.map(reminder);
}

/**
 * Uyum hatırlatması satırları (girintili madde işaretleriyle). Bölgede ilgili kural yoksa o grup atlanır; hiç kural
 * yoksa boş dizi döner (Kısıtlar yalnız genel kurallarla kalır).
 */
export function complianceReminderLines(region: ComplianceRegion, language: PromptLanguage): string[] {
  const t = promptStrings(language);
  const groups = [
    { label: t.constraints.paid, items: findingsFor(region, { paid: true, ai: false }) },
    { label: t.constraints.ai, items: findingsFor(region, { paid: false, ai: true }) },
  ].filter((group) => group.items.length > 0);
  if (groups.length === 0) return [];

  return [
    `- ${t.constraints.complianceLead(t.regionLabel[region])}`,
    ...(t.constraints.ruleTextNote ? [`  ${t.constraints.ruleTextNote}`] : []),
    ...groups.flatMap((group) => [`  - ${group.label}:`, ...group.items.map((item) => `    - ${item}`)]),
    `  - ${t.constraints.disclaimer}`,
  ];
}
