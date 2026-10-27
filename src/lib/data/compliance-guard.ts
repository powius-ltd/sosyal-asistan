/**
 * Yayın uyum koruması: TÜM depo uygulamaları (mock, Supabase) onaya gönderme ve onay anında AYNI fonksiyonu çağırır.
 * `fail` → `ComplianceFailedError` (`invalid_state` + Türkçe mesaj); `warn` engellemez, sonuç çağırana döner.
 * Kural motoru `lib/compliance` (saf); bu dosya yalnız işten girdiyi kurar ve engeli uygular.
 */
import { checkCompliance, complianceFailureMessage } from "@/lib/compliance";
import type { ComplianceRegion, ComplianceResult } from "@/lib/domain/compliance";
import type { PublishJob } from "@/lib/domain/publish";
import { ComplianceFailedError } from "@/lib/data/repository";

/** Yalnız denetimin okuduğu iş alanları (girdi tipi: oluşturma girdisi de bunu sağlar). */
export type ComplianceJobFields = Pick<PublishJob, "paidPartnership" | "aiGenerated" | "advertiserName"> & { caption?: string };

/** İşi bölgeye göre denetler; `fail` ise fırlatır, değilse sonucu (ok/warn) döndürür. */
export function assertPublishCompliant(job: ComplianceJobFields, region: ComplianceRegion): ComplianceResult {
  const result = checkCompliance({
    caption: job.caption ?? "",
    isPaidPartnership: job.paidPartnership,
    isAiGenerated: job.aiGenerated,
    advertiserName: job.advertiserName,
    region,
  });
  const message = complianceFailureMessage(result);
  if (message) throw new ComplianceFailedError(message, result);
  return result;
}
