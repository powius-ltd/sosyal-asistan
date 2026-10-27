import { EvidenceLinks } from "@/components/briefing/evidence-links";
import { WhyDisclosure } from "@/components/common/why-disclosure";
import type { BriefingEvidenceRef } from "@/lib/domain/briefing";

/**
 * "Neden?": yanıtın dayandığı kanıt bağlantıları. Katman (`WhyDisclosure`) ve kanıt çipleri (`EvidenceLinks`) brifing kartıyla AYNI
 * bileşenlerdir; sohbete özel biçim yoktur.
 */
export function ChatEvidence({ evidence }: { evidence: readonly BriefingEvidenceRef[] }) {
  if (evidence.length === 0) return null;
  return (
    <WhyDisclosure>
      <EvidenceLinks evidence={evidence} />
    </WhyDisclosure>
  );
}
