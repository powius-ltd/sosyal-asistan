import { getPanelContext } from "@/lib/data";
import { jobsAvailability } from "@/lib/job-control/availability";
import { launchedWorkerAlive } from "@/lib/job-control/launch";
import { handleJobsStatusRequest } from "@/lib/job-control/status-view";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

// Panel işi durumu (yoklama ucu): yanıt `JobsStatusResponse`. Çalışma alanı sorgudan / gövdeden değil `getPanelContext()`'ten; `?id=`
// (`JOBS_STATUS_ID_PARAM`) verilirse o iş de döner. Tutar, sağlayıcı, günlük ve ham not YALNIZ yönetici modunda (`operator` alanı).
// `GET` yan etkisizdir: iş başlatmaz, işçi dürtmez, yetim iş kapatmaz (akış ve kurallar `lib/job-control/status-view.ts`). Durum şeridini
// herkes gördüğü için uç iş başlatma kapısına bağlı değildir. Route handler Next 16'da önbelleklenmez.
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return handleJobsStatusRequest(request, {
    getContext: getPanelContext,
    operator: () => isOperatorMode(),
    canKick: () => jobsAvailability().available && !launchedWorkerAlive(),
    log: (message, error) => console.error(`[isler] ${message}`, error),
  });
}
