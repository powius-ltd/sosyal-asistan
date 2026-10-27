/** Uyum denetimi (kural tabanlı, saf). Tipler `lib/domain/compliance.ts`'te; kural sahipliği sıralı ajanlarda. */
export { checkCompliance } from "@/lib/compliance/check";
export { COMPLIANCE_DISCLAIMER, complianceFailureMessage } from "@/lib/compliance/messages";
export { foldTurkish } from "@/lib/compliance/normalize";
export type {
  ComplianceFinding,
  ComplianceInput,
  ComplianceRegion,
  ComplianceResult,
  ComplianceSeverity,
  ComplianceStatus,
} from "@/lib/domain/compliance";
