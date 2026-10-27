/**
 * Harcama kapısı (saf): işçi para harcayan bir koşuyu başlatmadan ÖNCE buna sorar. Tavan YALNIZ satırdaki onaydan gelir
 * (`job.approval`; ortam değişkeni / betik varsayılanı yok). Kapı kapalıysa harcayan işlev HİÇ çağrılmaz.
 *
 * Kurallar: onay kaydı yoksa kapalı · dayanak `credits` ise kapalı (kredi onayı USD yetkisi vermez) · dayanak tür tablosunda (`JOB_KIND_SPEC.approvalBases`) yoksa kapalı · onay `JOB_APPROVAL_TTL_MS`'ten
 * eskiyse (ya da anı okunamıyorsa / gelecekteyse) kapalı · `one_time` tutarı geçerli (0 < tutar ≤ `JOB_SPEND_MAX_USD`) değilse kapalı.
 * Kod: eskimiş onay `approval_expired`; geçerli onay kaydının olmadığı diğer hâller `approval_missing` (aylık sınırla ilgisi yoktur:
 * `budget_refused` yalnız harcayan işlevin kendi tavan kuralı reddedince yazılır).
 * `monthly_cap` dayanağında satırda tutar yoktur: tavan çalışma alanının onaylı aylık tavanıdır; ölçümde harcayan işlevin kendi kuralı
 * (`decideMeasureBudget`), toplama / rakip bulmada ajan tavanının kalan hakkı (`agentCeiling`) denetler. Kuru koşu para harcamaz: kapıya sorulmaz.
 */
import "server-only";

import { isJobApprovalFresh, isUsdApprovalBasis, jobAcceptsBasis, JOB_SPEND_MAX_USD, type JobOutcomeCode, type JobUsdApprovalBasis, type PanelJob } from "@/lib/domain/panel-job";

export type SpendGate =
  | { open: true; basis: JobUsdApprovalBasis; /** Onaylı tavan (USD); `one_time` ve `onboarding` (sabit tavan) dayanağında dolu. */ maxUsd?: number }
  | { open: false; code: Extract<JobOutcomeCode, "approval_expired" | "approval_missing">; note: string };

export function spendGate(job: Pick<PanelJob, "kind" | "approval"> & { params?: Pick<PanelJob["params"], "source"> }, now: Date): SpendGate {
  const { approval } = job;
  if (approval === undefined) return { open: false, code: "approval_missing", note: "Onay kaydı yok: para harcayan koşu başlatılmadı." };
  // Kredi onayı USD onayının yerine GEÇMEZ: yalnız kredi tavanı taşıyan iş Apify'a para harcatamaz.
  if (!isUsdApprovalBasis(approval.basis)) return { open: false, code: "approval_missing", note: "Tutar onayı yok (yalnız kredi onayı var): para harcayan koşu başlatılmadı." };
  if (!jobAcceptsBasis(job.kind, approval.basis)) {
    return { open: false, code: "approval_missing", note: `Bu iş türünde "${approval.basis}" onayı geçerli değil: para harcayan koşu başlatılmadı.` };
  }
  if (!isJobApprovalFresh(approval.approvedAt, now)) {
    return { open: false, code: "approval_expired", note: `Onay 24 saatten eski (${approval.approvedAt}): para harcayan koşu başlatılmadı; yeniden onay gerekir.` };
  }
  // Toplama / rakip bulmada `monthly_cap` = AJAN tavanı: yalnız ajan işaretli satırda geçer ve satırda tutar yoktur; kalan hak çalışma alanından
  // (onaylı tavan − bu ayın ajan harcaması) çözülür (`run-single.ts` `agentCeiling`). İşaretsiz satır (DB zaten yazdırmaz) kapalıdır.
  if (approval.basis === "monthly_cap" && (job.kind === "collect" || job.kind === "discover") && job.params?.source !== "agent") {
    return { open: false, code: "approval_missing", note: "Aylık tavan onayı yalnız yönetici ajanın işinde geçerli: para harcayan koşu başlatılmadı." };
  }
  if (approval.basis === "monthly_cap") return { open: true, basis: "monthly_cap" };
  const { maxUsd } = approval;
  if (maxUsd === undefined || !Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > JOB_SPEND_MAX_USD) {
    return { open: false, code: "approval_missing", note: "Onaylı tutar geçersiz: para harcayan koşu başlatılmadı." };
  }
  return { open: true, basis: approval.basis, maxUsd };
}

/**
 * Haftalık turun toplama tavanı (`RoutineArgs.apifyMaxUsd`): yalnız geçerli, taze, tek seferlik onay varsa satırdaki tutar; aksi halde
 * undefined (toplama adımı "onay bekliyor" kalır, diğer adımlar $0 koşar). Kuru koşuda her zaman undefined.
 */
export function routineCollectMaxUsd(job: Pick<PanelJob, "kind" | "dryRun" | "approval">, now: Date): number | undefined {
  if (job.dryRun || job.approval === undefined || !isUsdApprovalBasis(job.approval.basis)) return undefined;
  const gate = spendGate(job, now);
  return gate.open ? gate.maxUsd : undefined;
}
