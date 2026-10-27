/**
 * Yayın uyum denetimi tipleri (kural tabanlı, LLM yok). Kural motoru `lib/compliance/**`'tedir; tipler burada durur ki
 * `Workspace`, ekranlar (`CompliancePanel`) ve depo aynı sözlüğü kullansın.
 *
 * Bu bir hatırlatmadır, hukuki tavsiye DEĞİLDİR (bkz. `lib/compliance` `COMPLIANCE_DISCLAIMER`).
 */

/** Workspace'in uyum bölgesi: hangi ülke kuralları uygulanır. Varsayılan "TR". */
export const COMPLIANCE_REGIONS = ["TR", "US", "TR_US"] as const;

export type ComplianceRegion = (typeof COMPLIANCE_REGIONS)[number];

export const DEFAULT_COMPLIANCE_REGION: ComplianceRegion = "TR";

export const COMPLIANCE_REGION_LABEL: Record<ComplianceRegion, string> = {
  TR: "Türkiye",
  US: "ABD",
  TR_US: "Türkiye + ABD",
};

/** ok: sorun yok · warn: öneri/eksik ama engellemez · fail: yayın onayı/onaya gönderme engellenir. */
export type ComplianceStatus = "ok" | "warn" | "fail";

export type ComplianceSeverity = Exclude<ComplianceStatus, "ok">;

export interface ComplianceFinding {
  /** Kural kimliği ("tr.ad-label", "us.paid-disclosure" …); testlerde ve günlükte kural izlenir. */
  ruleId: string;
  severity: ComplianceSeverity;
  /** Kullanıcıya gösterilen Türkçe sorun cümlesi. */
  message: string;
  /** Nasıl düzeltileceği (varsa). */
  hint?: string;
}

export interface ComplianceResult {
  status: ComplianceStatus;
  findings: ComplianceFinding[];
}

/** `checkCompliance` girdisi. `caption` boşsa "" verilir (açıklama yok = ibare yok). */
export interface ComplianceInput {
  caption: string;
  isPaidPartnership: boolean;
  isAiGenerated: boolean;
  /** Reklam veren (marka) adı; ücretli iş birliğinde açıklamada görünmesi beklenir. */
  advertiserName?: string;
  region: ComplianceRegion;
}
