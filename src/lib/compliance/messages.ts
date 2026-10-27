/**
 * Uyum denetimi metinleri: depo hatası ve ekran aynı cümleyi kullanır.
 */
import type { ComplianceResult } from "@/lib/domain/compliance";

export const COMPLIANCE_DISCLAIMER = "Bu denetim kural tabanlı bir hatırlatmadır; hukuki tavsiye değildir.";

/**
 * `fail` sonucundan kullanıcıya gösterilecek metin (depo `invalid_state` mesajı). `fail` bulgusu yoksa undefined
 * (engel yok; `warn` yayını engellemez).
 */
export function complianceFailureMessage(result: ComplianceResult): string | undefined {
  const fails = result.findings.filter((f) => f.severity === "fail");
  if (fails.length === 0) return undefined;
  return `Uyum denetimi başarısız: ${fails.map((f) => f.message).join(" ")} Açıklamayı düzeltip tekrar dene.`;
}
