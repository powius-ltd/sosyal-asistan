/**
 * İş ekranlarının ORTAK sunucu hazırlığı (`chat/chat-slot-props.ts` deseni): durum şeridi yuvası, `JobAction` ve `/isler` aynı okumayı
 * kullanır. React `cache()` ile istek başına bir kez okunur (bir sayfada birçok düğme olsa da tek sorgu).
 *
 * Kapı tek yerde: iş başlatılabilir = yönetici modu VE ortam uygun (`jobsAvailability`). Kapalıyken düğme çizilmez; action'lar aynı
 * kapıyı sunucuda ayrıca denetler (bu dosya yalnız neyin çizileceğine karar verir).
 */
import "server-only";

import { cache } from "react";

import type { JobRunContext, JobsSeed, JobSpendContext } from "@/components/jobs/job-run-types";
import { costView } from "@/lib/cost";
import { getPanelContext } from "@/lib/data";
import { toJobsStatusResponse } from "@/lib/domain/panel-job-view";
import { jobsAvailability, type JobsUnavailableReason } from "@/lib/job-control/availability";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

/** İşler neden başlatılamıyor: `customer` = yönetici modu kapalı (müşteri görünümü); diğerleri ortam nedeni. */
export type JobsClosedReason = "customer" | JobsUnavailableReason;

export interface JobsState {
  /** Yönetici modu: tutar, günlük, ham not yalnız bu modda okunur ve çizilir. */
  operator: boolean;
  /** İşler bu istekte panelden başlatılabilir mi. */
  canRun: boolean;
  /** `canRun` false iken nedeni. */
  closed?: JobsClosedReason;
  /** Çalışma alanının etkin işi (görünüm yönetici moduna göre kurulur). */
  seed: JobsSeed;
}

export const loadJobsState = cache(async (): Promise<JobsState> => {
  const { repo, wsId, now } = await getPanelContext();
  const operator = isOperatorMode();
  const availability = jobsAvailability();
  const jobs = await repo.listJobs(wsId, { active: true, limit: 1 });
  const closed: JobsClosedReason | undefined = !operator ? "customer" : availability.available ? undefined : availability.reason;
  return {
    operator,
    canRun: closed === undefined,
    ...(closed === undefined ? {} : { closed }),
    seed: { scope: wsId, status: toJobsStatusResponse({ jobs, now, operator }) },
  };
});

/** Onay penceresinin harcama bilgisi: tavanlar + bu ayın harcaması. Okunamazsa undefined (para harcayan düğme kapalı çizilir). */
const loadJobSpendContext = cache(async (): Promise<JobSpendContext | undefined> => {
  try {
    const { repo, wsId } = await getPanelContext();
    const [workspace, cost] = await Promise.all([repo.getWorkspace(wsId), repo.getCostSummary(wsId)]);
    if (workspace === null) return undefined;
    return {
      caps: {
        ...(workspace.apifyMonthlyCapUsd === undefined ? {} : { apifyMonthlyCapUsd: workspace.apifyMonthlyCapUsd }),
        ...(workspace.measureMonthlyCapUsd === undefined ? {} : { measureMonthlyCapUsd: workspace.measureMonthlyCapUsd }),
      },
      month: costView(cost.apify),
    };
  } catch (error) {
    console.error("[isler] harcama bilgisi okunamadı", error);
    return undefined;
  }
});

/**
 * `RunJobButton`'ın bağlamı. YALNIZ işler başlatılabiliyorken çağrılır (`loadJobsState().canRun`): harcama bilgisi yönetici bilgisidir.
 * `JobAction` bunu kendisi çağırır; düğmeyi bir istemci bileşeninin içinde çizmek gerekirse sunucu üst bileşeni bunu okuyup prop verir.
 */
export async function loadJobRunContext(): Promise<JobRunContext> {
  const [state, spend] = await Promise.all([loadJobsState(), loadJobSpendContext()]);
  return { seed: state.seed, ...(spend === undefined ? {} : { spend }) };
}
