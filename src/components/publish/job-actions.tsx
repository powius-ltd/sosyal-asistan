"use client";

import { Ban, Check, Copy, RotateCcw, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { approvePublishJob, cancelPublishJob, submitPublishJob } from "@/app/actions/publish";
import { Hint } from "@/components/common/hint";
import { CompliancePanel } from "@/components/publish/compliance-panel";
import { ConfirmDialog, JobSummary, type JobActionsSummary } from "@/components/publish/job-confirm-dialog";
import { PublishFormDialog, type PublishFix, type PublishFormDialogProps } from "@/components/publish/publish-form-dialog";
import { ReviseButton, type ReviseButtonProps } from "@/components/studio-order/revise-button";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/result";
import type { ComplianceRegion, ComplianceResult } from "@/lib/domain/compliance";
import { SCHEDULED_ON_PROVIDER_PLAIN } from "@/lib/plain-language";
import { canApprove, canCancel, canSubmit, type PublishStatus } from "@/lib/domain/publish";
import { FIX_PLAIN } from "@/lib/plain-language-publish";
import { ROUTES } from "@/lib/routes";

export type { JobActionsSummary };

/** "Kopyala ve düzelt" için gereken bağlam: form seçenekleri ve işin değerleri (yalnız düzeltilebilir durumdaki işte verilir). */
export interface JobFixContext extends Pick<PublishFormDialogProps, "accounts" | "timeZone" | "complianceRegion" | "operator"> {
  fix: PublishFix;
  /** Sayfa adresiyle (`?duzelt=`) geldiyse form açık başlar. */
  autoOpen?: boolean;
}

interface JobActionsProps {
  jobId: string;
  status: PublishStatus;
  /** Dolu ise gönderi Zernio'da zamanlanmıştır: panelden iptal edilmez, not gösterilir. */
  containerId?: string;
  /** Açıklama yazılmış mı: boş taslak onaya gönderilemez (depo da reddeder). */
  hasCaption: boolean;
  /** Uyum denetimi sonucu (`checkCompliance`); `fail` iken "Onaya gönder" kapalı, "Onayla" hiç çizilmez: tek yol "Kopyala ve düzelt". */
  compliance: ComplianceResult;
  /** Denetimin uygulandığı bölge (panelde etiketlenir). */
  complianceRegion: ComplianceRegion;
  summary: JobActionsSummary;
  copy?: JobFixContext;
  /** Yönetici modu: onay penceresindeki uyum bulgularında kural kodu da görünür. */
  operator?: boolean;
  /** Stüdyo videosu onay bekliyorsa ve revize hakkı varsa "Revize iste" (SPN-36); yoksa düğme çizilmez. */
  revise?: ReviseButtonProps;
}

/**
 * Bir işin düğmeleri (yalnız geçerli olanlar çizilir; soluk "kullanılamaz" düğme yok, durumu rozet söyler):
 * taslak → "Onaya gönder"; onay bekleyen → "Onayla" (uyum engeli yoksa); düzeltilebilir (taslak / onay bekleyen / başarısız / süresi
 * dolan) → "Kopyala ve düzelt" ya da "Yeniden dene"; yayın başlamadan önce → "İptal". Onaya göndermek onay değildir.
 */
export function JobActions({ jobId, status, containerId, hasCaption, compliance, complianceRegion, summary, copy, operator = false, revise }: JobActionsProps) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(copy?.autoOpen ?? false);
  const [pending, startTransition] = useTransition();

  const blocked = compliance.status === "fail";
  const submittable = canSubmit(status);
  const approvable = canApprove(status) && !blocked;
  const cancellable = canCancel(status, containerId);
  const blockTip = `Uyum engeli: ${compliance.findings.find((finding) => finding.severity === "fail")?.message ?? "açıklamayı düzeltmeden onaya gönderilemez."}`;

  function run(action: (id: string) => Promise<ActionResult>, successMessage: string, close: () => void) {
    startTransition(async () => {
      const result = await action(jobId);
      if (result.ok) {
        toast.success(successMessage);
        close();
      } else {
        toast.error(result.message);
      }
    });
  }

  function closeFix(open: boolean) {
    setFixOpen(open);
    // Adresteki `?duzelt=` kalırsa yenilemede form yeniden açılırdı.
    if (!open && copy?.autoOpen) window.history.replaceState(null, "", `${ROUTES.publish}#is-${encodeURIComponent(jobId)}`);
  }

  const submitButton = (
    <Button
      size="sm"
      className="min-h-tap flex-1 sm:flex-none md:min-h-0"
      disabled={pending || !hasCaption || blocked}
      onClick={() => run(submitPublishJob, "Yayın onaya gönderildi.", () => undefined)}
    >
      <Send data-icon="inline-start" aria-hidden />
      Onaya gönder
    </Button>
  );

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {submittable ? (
        !hasCaption ? (
          <Hint content="Açıklama yazılmamış: taslağı onaya göndermek için açıklama gerekir." label="Onaya gönder devre dışı">
            {submitButton}
          </Hint>
        ) : blocked ? (
          <Hint content={blockTip} label={`Onaya gönder devre dışı. ${blockTip}`}>
            {submitButton}
          </Hint>
        ) : (
          submitButton
        )
      ) : null}
      {approvable ? (
        <Button size="sm" className="min-h-tap flex-1 sm:flex-none md:min-h-0" onClick={() => setApproveOpen(true)}>
          <Check data-icon="inline-start" aria-hidden />
          Onayla
        </Button>
      ) : null}
      {revise ? <ReviseButton {...revise} /> : null}
      {copy ? (
        <Button
          size="sm"
          variant={blocked || copy.fix.mode === "retry" ? "default" : "outline"}
          className="min-h-tap flex-1 sm:flex-none md:min-h-0"
          onClick={() => setFixOpen(true)}
        >
          {copy.fix.mode === "retry" ? <RotateCcw data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
          {FIX_PLAIN[copy.fix.mode].button}
        </Button>
      ) : null}
      {containerId && status === "ready" ? <p className="basis-full text-xs text-muted-foreground">{SCHEDULED_ON_PROVIDER_PLAIN}</p> : null}
      {cancellable ? (
        <Button size="sm" variant="outline" className="min-h-tap flex-1 sm:flex-none md:min-h-0" onClick={() => setCancelOpen(true)}>
          <Ban data-icon="inline-start" aria-hidden />
          İptal
        </Button>
      ) : null}

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Yayın kuyruğuna onayla"
        description="Bu videoyu yayın kuyruğuna onaylıyorsun. Onaydan sonra yayın planlanan zamanda gönderilir."
        confirmLabel="Onayla ve kuyruğa al"
        confirmDisabled={blocked}
        pending={pending}
        onConfirm={() => run(approvePublishJob, "Yayın onaylandı ve kuyruğa alındı.", () => setApproveOpen(false))}
      >
        <JobSummary summary={summary} />
        <CompliancePanel result={compliance} region={complianceRegion} showRuleIds={operator} />
      </ConfirmDialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Yayın işini iptal et"
        description="Bu iş iptal edilir ve yayınlanmaz. Bu işlem geri alınamaz."
        confirmLabel="İşi iptal et"
        confirmVariant="destructive"
        pending={pending}
        onConfirm={() => run(cancelPublishJob, "Yayın işi iptal edildi.", () => setCancelOpen(false))}
      >
        <JobSummary summary={summary} />
      </ConfirmDialog>

      {copy ? (
        <PublishFormDialog
          open={fixOpen}
          onOpenChange={closeFix}
          accounts={copy.accounts}
          timeZone={copy.timeZone}
          complianceRegion={copy.complianceRegion}
          operator={copy.operator}
          fix={copy.fix}
        />
      ) : null}
    </div>
  );
}
