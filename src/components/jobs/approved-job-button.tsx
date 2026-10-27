"use client";

import Link from "next/link";
import { useState } from "react";

import { cancelJobAction } from "@/app/actions/jobs";
import { callAction } from "@/components/common/call-action";
import { JobApprovalDialog } from "@/components/jobs/job-approval-dialog";
import { JobButtonFrame, type JobButtonLook } from "@/components/jobs/job-button-frame";
import type { JobRequest, JobRunContext } from "@/components/jobs/job-run-types";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import { useJobRun } from "@/components/jobs/use-job-run";
import type { JobApprovalInput } from "@/lib/data/queries";
import { availableApprovalBases } from "@/lib/domain/panel-job";
import { ROUTES } from "@/lib/routes";

/** Onay isteyen (para harcayan) iş isteği: tahmin işi aynı istekten `dryRun` ile kurulur. */
export type SpendJobRequest = Extract<JobRequest, { kind: "collect" | "measure" }>;

interface ApprovedJobButtonProps extends JobButtonLook {
  request: SpendJobRequest;
  label: string;
  context: JobRunContext;
}

/**
 * Para harcayan işin düğmesi: basınca iş BAŞLAMAZ; onay penceresi açılır ve önce $0 tahmin işi koşar. Gerçek iş yalnız "Onayla ve
 * başlat" ile, onay kaydıyla açılır. Harcama kapalıysa (aylık sınır 0) ya da harcama bilgisi okunamadıysa düğme kapalı çizilir.
 */
export function ApprovedJobButton({ request, label, context, ...look }: ApprovedJobButtonProps) {
  const run = useJobRun(context.seed);
  const estimate = useJobRun(context.seed);
  const [open, setOpen] = useState(false);
  const spend = context.spend;
  const bases = spend === undefined ? [] : availableApprovalBases(request.kind, spend.caps);

  const startEstimate = () => void estimate.start({ ...request, dryRun: true });
  const begin = () => {
    setOpen(true);
    startEstimate();
  };
  const close = () => {
    setOpen(false);
    // Tahmin işi hâlâ sıradaysa / sürüyorsa durdurulur ($0 iştir; kalsa da harcamaz ama yeni işi bekletir).
    if (estimate.phase.name === "waiting") {
      const { jobId } = estimate.phase;
      void callAction(() => cancelJobAction({ jobId })).then(() => jobStatusStore.refresh());
    }
  };
  const approve = async (approval: JobApprovalInput) => {
    const jobId = await run.start({ ...request, approval });
    if (jobId !== undefined) setOpen(false);
  };

  const closedNote =
    spend === undefined ? (
      "Harcama bilgisini okuyamadım; bu iş şu an başlatılamıyor."
    ) : bases.length === 0 ? (
      <>
        Bu iş için harcama şu an kapalı (aylık sınır 0).{" "}
        <Link href={ROUTES.settings} className="underline underline-offset-2">
          Ayarlar&apos;dan aç
        </Link>
        .
      </>
    ) : undefined;

  return (
    <>
      <JobButtonFrame {...look} label={label} run={run} onPress={begin} onRetry={begin} closedNote={closedNote} />
      {spend !== undefined && bases.length > 0 ? (
        <JobApprovalDialog
          open={open}
          title={label}
          kind={request.kind}
          estimate={estimate.phase}
          spend={spend}
          bases={bases}
          submitting={run.phase.name === "requesting"}
          submitError={open && run.phase.name === "failed" ? run.phase.message : undefined}
          onApprove={(approval) => void approve(approval)}
          onRetryEstimate={startEstimate}
          onClose={close}
        />
      ) : null}
    </>
  );
}
