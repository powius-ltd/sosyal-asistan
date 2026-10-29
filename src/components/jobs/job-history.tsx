import { ChevronDown, History } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { jobDurationLabel } from "@/components/jobs/job-format";
import { JobOperatorDetail } from "@/components/jobs/job-operator-detail";
import type { JobRequest, JobRunContext } from "@/components/jobs/job-run-types";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { JobStepList } from "@/components/jobs/job-step-list";
import { RunJobButton } from "@/components/jobs/run-job-button";
import type { JobStatus } from "@/lib/domain/panel-job";
import type { JobStatusView } from "@/lib/domain/panel-job-view";
import { formatDateTime } from "@/lib/format";
import { JOB_SCREEN_PLAIN, jobOutcomePhrase, jobTitlePhrase, jobTookPhrase } from "@/lib/plain-language";

/** Yeniden başlatılabilen bitişler: iş tamamlanmadıysa (durdu, kısmi, tamamlanamadı, durduruldu). */
const RESTARTABLE: readonly JobStatus[] = ["partial", "blocked", "failed", "cancelled"];

/**
 * Bitmemiş işin yeniden başlatma isteği: aynı tür (+ toplamada aynı video sayısı). Onay TAŞINMAZ: para harcayan iş yeni onay penceresi
 * açar. Planın haftası taşınmaz (eski haftaya plan yazılmasın; işin varsayılanı kullanılır).
 */
export function restartRequest(view: JobStatusView): JobRequest | undefined {
  // Başlangıç işi geçmişten yeniden başlatılmaz: akışın kendi eylemleri vardır (deneme hakkı, sabit onay).
  if (view.dryRun || view.kind === "onboarding" || view.kind === "measure_zernio" || view.kind === "discover" || view.kind === "order" || view.kind === "produce" || view.kind === "order_return" || view.kind === "publish" || view.kind === "ads_sync" || !RESTARTABLE.includes(view.status)) return undefined;
  if (view.kind === "collect") {
    const limit = view.operator?.params.limit;
    return { kind: "collect", ...(limit === undefined ? {} : { limit }) };
  }
  return { kind: view.kind };
}

interface JobHistoryProps {
  /** Bitmiş işler, yeniden eskiye (görünüm sunucuda kurulur; müşteri görünümünde yönetici ayrıntısı taşımaz). */
  jobs: readonly JobStatusView[];
  timeZone: string;
  /** İşler başlatılabiliyorsa bağlam: en üstteki (son) iş tamamlanmadıysa "Yeniden başlat" çizilir. */
  context?: JobRunContext;
}

/**
 * İş geçmişi (`/isler`): her satır tür + durum + ne zaman + ne kadar sürdü + sonuç cümlesi; açılınca adım sonuçları. Metinler sözlükten.
 * Yönetici modunda ham adım notu, onay / tutar, teknik hata ve günlük de açılır; müşteri görünümünde bu alanlar hiç gelmez. Satırlar
 * yerel `details` öğesidir (klavyeyle açılır); en üstteki açık gelir.
 */
export function JobHistory({ jobs, timeZone, context }: JobHistoryProps) {
  if (jobs.length === 0) {
    return <EmptyState icon={History} title={JOB_SCREEN_PLAIN.historyEmptyTitle} description={JOB_SCREEN_PLAIN.historyEmpty} />;
  }
  return (
    <ul data-slot="job-history" className="flex flex-col gap-2">
      {jobs.map((view, index) => {
        const when = formatDateTime(view.createdAt, timeZone);
        const duration = jobDurationLabel(view);
        const restart = index === 0 && context !== undefined ? restartRequest(view) : undefined;
        return (
          <li key={view.id} data-job={view.id} data-status={view.status}>
            <details open={index === 0} className="group/job rounded-lg border bg-card">
              <summary className="flex cursor-pointer list-none flex-col gap-1 rounded-lg px-3 py-2.5 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[0.9375rem] font-medium">{jobTitlePhrase(view)}</span>
                  <JobStatusBadge view={view} />
                  <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-fast group-open/job:rotate-180" aria-hidden />
                </span>
                <span className="text-xs text-muted-foreground">
                  {when ?? JOB_SCREEN_PLAIN.timeUnknown}
                  {duration !== undefined ? ` · ${jobTookPhrase(duration)}` : ""}
                </span>
                <span className="text-sm text-muted-foreground">{jobOutcomePhrase(view)}</span>
              </summary>
              <div className="flex flex-col gap-3 border-t px-3 py-3">
                <JobStepList view={view} outcomeShown />
                <JobOperatorDetail view={view} timeZone={timeZone} />
                {view.steps.length === 0 ? <p className="text-sm text-muted-foreground">{JOB_SCREEN_PLAIN.noSteps}</p> : null}
                {restart !== undefined && context !== undefined ? <RunJobButton request={restart} label="Yeniden başlat" context={context} quietWhenBlocked /> : null}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
