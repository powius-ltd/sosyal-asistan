import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { JobHistory } from "@/components/jobs/job-history";
import { JobsClosedNotice } from "@/components/jobs/jobs-closed-notice";
import { JobsStartPanel } from "@/components/jobs/jobs-start-panel";
import { loadJobRunContext, loadJobsState } from "@/components/jobs/jobs-state";
import { LiveJobPanel } from "@/components/jobs/live-job-panel";
import { getPanelContext } from "@/lib/data";
import { appliesAngleLabeling, DEFAULT_ACCOUNT_TYPE } from "@/lib/domain/account-type";
import { JOB_HISTORY_LIMIT, type PanelJob } from "@/lib/domain/panel-job";
import { toJobStatusView } from "@/lib/domain/panel-job-view";
import { DEFAULT_TIMEZONE, formatNumber } from "@/lib/format";
import { listOperatorWorkspaces } from "@/lib/workspace/registry";

export const metadata: Metadata = { title: "İşler" };

/**
 * En son bilinen toplama tahmini (işler yeniden eskiye): haftalık turun toplama adımındaki ya da "Hesaba bak" işindeki tahmin. Haftalık
 * turun tutar alanına yalnız ÖN DEĞER olur (onay değildir; işçi tahmini koşu anında yeniden alır). Hiç tahmin yoksa undefined.
 */
function latestCollectEstimate(jobs: readonly PanelJob[]): number | undefined {
  for (const job of jobs) {
    const estimate = job.steps.find((step) => step.id === "collect")?.spend?.estimateUsd ?? (job.kind === "collect" ? job.result?.estimate?.usd : undefined);
    if (estimate !== undefined) return estimate;
  }
  return undefined;
}

/**
 * İşler: haftalık turu ve tek tek işleri başlat, çalışan işi izle / durdur, son işlerin sonucuna bak. Düğmeler YALNIZ işler
 * başlatılabiliyorken çizilir (yönetici modu + ortam uygun: `jobs-state.ts`); kapalıyken sayfa nedenini düz dille söyler. Tutar, ham adım
 * notu, teknik hata ve günlük yalnız yönetici modunda okunur (`toJobStatusView(…, { operator })`): müşteri görünümüne hiç gönderilmez.
 */
export default async function JobsPage() {
  const { repo, wsId, now } = await getPanelContext();
  const state = await loadJobsState();
  const [finished, workspace, context, workspaces] = await Promise.all([
    repo.listJobs(wsId, { active: false, limit: JOB_HISTORY_LIMIT }),
    repo.getWorkspace(wsId),
    state.canRun ? loadJobRunContext() : undefined,
    // Liste süs bilgisidir ("tüm hesaplar" düğmesi): okunamazsa düğme çizilmez, sayfa çökmez.
    state.canRun ? listOperatorWorkspaces().catch(() => undefined) : undefined,
  ]);
  const timeZone = workspace?.timezone ?? DEFAULT_TIMEZONE;
  const history = finished.map((job) => toJobStatusView(job, { now, operator: state.operator }));

  return (
    <>
      <PageHeader
        title="İşler"
        description={state.canRun ? "Haftalık turu ve tek tek işleri buradan başlat; ilerlemesini ve sonucunu izle." : "Yapılan işlerin ilerlemesi ve sonucu."}
      />
      <div className="flex flex-col gap-6">
        {state.closed !== undefined ? <JobsClosedNotice reason={state.closed} /> : null}
        <LiveJobPanel seed={state.seed} canRun={state.canRun} timeZone={timeZone} />
        <div className={context !== undefined ? "grid gap-6 xl:grid-cols-2 xl:items-start" : "grid gap-6"}>
          {context !== undefined ? (
            <JobsStartPanel
              context={context}
              workspaceCount={workspaces?.length ?? 1}
              collectEstimateUsd={latestCollectEstimate(finished)}
              angleLabeling={appliesAngleLabeling(workspace?.accountType ?? DEFAULT_ACCOUNT_TYPE)}
            />
          ) : null}
          <section aria-labelledby="jobs-history-title" className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 id="jobs-history-title" className="font-heading text-lg font-medium">
                Geçmiş
              </h2>
              <p className="text-sm text-muted-foreground">Son {formatNumber(JOB_HISTORY_LIMIT)} iş, yeniden eskiye.</p>
            </div>
            <JobHistory jobs={history} timeZone={timeZone} context={context} />
          </section>
        </div>
      </div>
    </>
  );
}
