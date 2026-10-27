/**
 * Yayın uyum denetimi: SAF fonksiyon (aynı girdi → aynı sonuç; ağ/LLM/saat yok). İstemci (canlı panel) ve depo
 * (onaya gönderme/onay engeli) aynı fonksiyonu çağırır. Kurallar `rules.ts`'tedir.
 */
import type { ComplianceFinding, ComplianceInput, ComplianceRegion, ComplianceResult } from "@/lib/domain/compliance";
import { COMPLIANCE_RULES, makeCaptionView, type ComplianceRule } from "@/lib/compliance/rules";

/** Bu bölgede geçerli kurallar. Bilinmeyen bölge (tip dışı veri) EN SIKI davranır: iki bölge de uygulanır. */
function ruleIsActive(rule: ComplianceRule, region: ComplianceRegion): boolean {
  if (region === "TR") return rule.region === "TR";
  if (region === "US") return rule.region === "US";
  return true;
}

export function checkCompliance(input: ComplianceInput): ComplianceResult {
  const caption = typeof input.caption === "string" ? input.caption : "";
  const view = makeCaptionView(caption);

  const findings: ComplianceFinding[] = COMPLIANCE_RULES.filter(
    (rule) => ruleIsActive(rule, input.region) && rule.appliesTo(input) && !rule.isSatisfied(view, input),
  ).map((rule) => ({
    ruleId: rule.id,
    severity: rule.severity,
    message: rule.message,
    ...(rule.hint ? { hint: rule.hint } : {}),
  }));

  const status = findings.some((f) => f.severity === "fail") ? "fail" : findings.length > 0 ? "warn" : "ok";
  return { status, findings };
}
