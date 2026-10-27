/**
 * Yeni yayın formunun uyum/Trial alanları (saf): tek yerde durur ki canlı denetim ile sunucuya giden yük AYNI
 * girdiden türesin. Sunucu ayrıca doğrular (`publish-schemas.ts`, depo): istemciye güvenilmez.
 */
import type { ComplianceInput, ComplianceRegion } from "@/lib/domain/compliance";
import type { TrialGraduation, TrialSettings } from "@/lib/domain/publish";

export interface PublishFlags {
  paidPartnership: boolean;
  /** Ham metin; yalnız ücretli iş birliğinde anlamlıdır. */
  advertiserName: string;
  aiGenerated: boolean;
  trialEnabled: boolean;
  trialGraduation: TrialGraduation;
}

export const EMPTY_FLAGS: PublishFlags = {
  paidPartnership: false,
  advertiserName: "",
  aiGenerated: false,
  trialEnabled: false,
  trialGraduation: "manual",
};

/** Kırpılmış reklam veren adı; ücretli iş birliği yoksa ya da boşsa undefined. */
function advertiserOf(flags: PublishFlags): string | undefined {
  const name = flags.paidPartnership ? flags.advertiserName.trim() : "";
  return name === "" ? undefined : name;
}

/** Canlı uyum denetimi girdisi (`checkCompliance`). */
export function toComplianceInput(caption: string, flags: PublishFlags, region: ComplianceRegion): ComplianceInput {
  return {
    caption,
    isPaidPartnership: flags.paidPartnership,
    isAiGenerated: flags.aiGenerated,
    advertiserName: advertiserOf(flags),
    region,
  };
}

/** `createPublishJob` action'ına giden uyum/Trial alanları. Trial kapalıysa alan hiç gönderilmez (normal yayın). */
export function toPublishPayload(flags: PublishFlags): {
  paidPartnership: boolean;
  aiGenerated: boolean;
  advertiserName?: string;
  trial?: TrialSettings;
} {
  const advertiserName = advertiserOf(flags);
  return {
    paidPartnership: flags.paidPartnership,
    aiGenerated: flags.aiGenerated,
    ...(advertiserName ? { advertiserName } : {}),
    ...(flags.trialEnabled ? { trial: { enabled: true, graduation: flags.trialGraduation } } : {}),
  };
}
