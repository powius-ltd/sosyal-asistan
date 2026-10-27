import { CalendarClock, ExternalLink, Lightbulb, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { PlatformBadge } from "@/components/common/platform-badge";
import { ComplianceDot, JobFlagBadges } from "@/components/publish/job-badges";
import { JobActions, type JobFixContext } from "@/components/publish/job-actions";
import { type PublishJobView } from "@/components/publish/job-views";
import { prefillFromJob } from "@/components/publish/publish-form-state";
import { PublishStatusBadge } from "@/components/publish/publish-status";
import type { PublishFormDialogProps } from "@/components/publish/publish-form-dialog";
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ORDER_MEDIA_NOTE_PLAIN } from "@/lib/plain-language-order";
import { fixModeOf, plainPublishError } from "@/lib/plain-language-publish";
import { isOrderMediaPath } from "@/lib/order-media-path";
import { ROUTES } from "@/lib/routes";
import { safeExternalUrl } from "@/lib/safe-url";
import { truncateText } from "@/lib/text";

const CAPTION_PREVIEW_CHARS = 140;

/** Kartların "Kopyala ve düzelt" formunu kurması için sayfadan gelen ortak ayarlar (işe özel değer kartta türetilir). */
export interface PublishFixSettings extends Pick<PublishFormDialogProps, "accounts" | "complianceRegion" | "operator"> {
  /** İsteğin tek saati: kopyalanan işin geçmişe düşmüş planlanan zamanı forma taşınmaz. */
  now: Date;
  /** Adreste `?duzelt=` ile gelen iş: formu açık başlar. */
  fixJobId?: string;
}

const linkTap = "min-h-tap md:min-h-0";

/** Liste görünümünün bir satırı: hesap, açıklama, zaman, durum, hata, bağlantılar ve onay/iptal. */
export function PublishJobCard({ view, timeZone, fixSettings }: { view: PublishJobView; timeZone: string; fixSettings?: PublishFixSettings }) {
  const { job, accountLabel, ideaTitle } = view;
  const scheduled = formatDateTime(job.scheduledFor, timeZone);
  const permalink = job.status === "published" ? safeExternalUrl(job.permalink) : undefined;
  const showError = (job.status === "failed" || job.status === "expired") && job.error;
  // Denenmiş işlerde (ve başarısız/süresi dolmuşlarda) gerçek deneme sayısı gösterilir.
  const showAttempts = job.status === "failed" || job.status === "expired" || job.attemptCount > 0;
  const blockedMessage =
    (job.status === "draft" || job.status === "awaiting_approval") && view.compliance.status === "fail"
      ? view.compliance.findings.find((finding) => finding.severity === "fail")?.message
      : undefined;
  const fixMode = fixModeOf(job.status);
  // Yayın açabilen hesap yoksa form kurulamaz; düğme de çizilmez.
  const copy: JobFixContext | undefined =
    fixMode && fixSettings && fixSettings.accounts.length > 0
      ? {
          accounts: fixSettings.accounts,
          timeZone,
          complianceRegion: fixSettings.complianceRegion,
          operator: fixSettings.operator,
          fix: { jobId: job.id, mode: fixMode, prefill: prefillFromJob(job, timeZone, fixSettings.now) },
          autoOpen: fixSettings.fixJobId === job.id,
        }
      : undefined;

  return (
    <li
      id={`is-${job.id}`}
      className="flex scroll-mt-4 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground target:ring-2 target:ring-ring sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{accountLabel}</span>
          <PlatformBadge platform={job.platform} />
          <PublishStatusBadge status={job.status} />
          <JobFlagBadges job={job} />
          <ComplianceDot result={view.compliance} />
        </div>

        {job.caption ? (
          <p className="text-sm whitespace-pre-line" title={job.caption}>
            {truncateText(job.caption, CAPTION_PREVIEW_CHARS)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Açıklama yazılmamış.</p>
        )}

        {isOrderMediaPath(job.mediaPath) ? <p className="text-xs text-muted-foreground">{ORDER_MEDIA_NOTE_PLAIN}</p> : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5" aria-hidden />
            {scheduled ?? "Zaman belirtilmedi (onaydan sonra hemen)"}
          </span>
          {job.approvedAt ? <span>Onay: {formatDateTime(job.approvedAt, timeZone)}</span> : null}
          {job.approvedBy && fixSettings?.operator ? <span>Onaylayan: {job.approvedBy}</span> : null}
          {showAttempts ? (
            <span>Deneme sayısı: {formatNumber(job.attemptCount)}</span>
          ) : null}
          {job.ideaId ? (
            <Link
              href={`${ROUTES.ideas}?id=${encodeURIComponent(job.ideaId)}`}
              className={`inline-flex max-w-full items-center gap-1 hover:text-foreground hover:underline ${linkTap}`}
            >
              <Lightbulb className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{ideaTitle ?? "Bağlı fikir"}</span>
            </Link>
          ) : null}
          {permalink ? (
            <a
              href={permalink}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 hover:text-foreground hover:underline ${linkTap}`}
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Yayını aç
            </a>
          ) : null}
        </div>

        {showError ? (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>Son hata: {plainPublishError(job.error ?? "", PLATFORM_LABEL[job.platform])}</span>
          </p>
        ) : null}

        {blockedMessage ? (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>Önce düzeltilmesi gerekiyor: {blockedMessage}</span>
          </p>
        ) : null}
      </div>

      <JobActions
        jobId={job.id}
        status={job.status}
        containerId={job.containerId}
        hasCaption={Boolean(job.caption?.trim())}
        compliance={view.compliance}
        complianceRegion={view.complianceRegion}
        operator={fixSettings?.operator}
        copy={copy}
        summary={{
          account: accountLabel,
          caption: job.caption ? truncateText(job.caption, CAPTION_PREVIEW_CHARS) : undefined,
          when: scheduled,
        }}
      />
    </li>
  );
}
