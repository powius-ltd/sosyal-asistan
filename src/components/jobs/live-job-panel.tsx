"use client";

import { Loader2, Square } from "lucide-react";
import { useState } from "react";

import { cancelJobAction } from "@/app/actions/jobs";
import { callAction } from "@/components/common/call-action";
import { JobOperatorDetail } from "@/components/jobs/job-operator-detail";
import type { JobsSeed } from "@/components/jobs/job-run-types";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import { JobStepList } from "@/components/jobs/job-step-list";
import { useJobsStatus } from "@/components/jobs/use-jobs-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { JobStatusView } from "@/lib/domain/panel-job-view";
import { formatDateTime } from "@/lib/format";
import { JOB_SCREEN_PLAIN, jobStripPhrase, jobTitlePhrase } from "@/lib/plain-language";

const STOP_FAILED_MESSAGE = "İş durdurulamadı. Bağlantını kontrol edip tekrar dene.";

interface LiveJobPanelProps {
  seed: JobsSeed;
  /** İşler başlatılabiliyor (yönetici modu + ortam uygun): "Durdur" çizilir. */
  canRun: boolean;
  timeZone: string;
}

/**
 * Çalışan / sırada bekleyen işin canlı görünümü (`/isler`): düz dil cümlesi, adımlar gerçek durumlarıyla, yönetici modunda ham not +
 * tutar + günlük ve "Durdur". Durum şeritle AYNI ortak depodan okunur (ayrı yoklama yok). Etkin iş yokken bunu söyler.
 */
export function LiveJobPanel({ seed, canRun, timeZone }: LiveJobPanelProps) {
  const { active } = useJobsStatus(seed);
  return (
    <Card data-slot="live-job" data-state={active === undefined ? "idle" : active.stale ? "stale" : active.status}>
      <CardHeader>
        <CardTitle>{JOB_SCREEN_PLAIN.liveTitle}</CardTitle>
        {active === undefined ? <CardDescription>{JOB_SCREEN_PLAIN.idle}</CardDescription> : null}
      </CardHeader>
      {active === undefined ? null : (
        <CardContent>
          <ActiveJob key={active.id} view={active} canRun={canRun} timeZone={timeZone} />
        </CardContent>
      )}
    </Card>
  );
}

function ActiveJob({ view, canRun, timeZone }: { view: JobStatusView; canRun: boolean; timeZone: string }) {
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string>();
  const since = formatDateTime(view.startedAt ?? view.createdAt, timeZone);

  const stop = async () => {
    setStopping(true);
    setStopError(undefined);
    const result = await callAction(() => cancelJobAction({ jobId: view.id }), STOP_FAILED_MESSAGE);
    setStopping(false);
    if (!result.ok) {
      setStopError(result.message);
      return;
    }
    jobStatusStore.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[0.9375rem] font-medium">{jobTitlePhrase(view)}</h3>
            <JobStatusBadge view={view} />
          </div>
          <p className="text-sm break-words">{jobStripPhrase(view)}</p>
          {since !== undefined ? (
            <p className="text-xs text-muted-foreground">
              {view.startedAt === undefined ? JOB_SCREEN_PLAIN.queuedAt : JOB_SCREEN_PLAIN.startedAt}: {since}
            </p>
          ) : null}
        </div>
        {canRun ? (
          <Button type="button" variant="destructive" size="touch" className="w-full sm:w-fit" disabled={stopping || view.cancelRequested} aria-busy={stopping} onClick={() => void stop()}>
            {stopping ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Square aria-hidden />}
            Durdur
          </Button>
        ) : null}
      </div>

      {view.status === "running" && !view.stale ? (
        <div className="h-0.5 w-full max-w-64 overflow-hidden rounded-full bg-border" aria-hidden>
          <div className="h-full w-1/3 animate-progress rounded-full bg-ai-rule" />
        </div>
      ) : null}
      {view.stale && canRun ? <p className="text-sm text-warning-strong">Bir süredir yanıt gelmiyor. Durdurup yeniden başlatabilirsin.</p> : null}
      {stopError !== undefined ? (
        <p role="alert" className="border-l-2 border-destructive pl-3 text-sm">
          <span className="font-medium">Olmadı: </span>
          {stopError}
        </p>
      ) : null}

      <JobStepList view={view} />
      <JobOperatorDetail view={view} timeZone={timeZone} className="border-t pt-3" />
    </div>
  );
}
