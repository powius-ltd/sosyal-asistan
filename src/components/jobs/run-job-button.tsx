"use client";

import { ApprovedJobButton } from "@/components/jobs/approved-job-button";
import { JobButtonFrame, type JobButtonLook } from "@/components/jobs/job-button-frame";
import { JOB_PREVIEW_LABEL } from "@/components/jobs/job-format";
import type { JobRequest, JobRunContext } from "@/components/jobs/job-run-types";
import { useJobRun } from "@/components/jobs/use-job-run";
import { jobRequiresApproval } from "@/lib/domain/panel-job";
import { JOB_KIND_PLAIN } from "@/lib/plain-language";

export interface JobButtonOptions extends JobButtonLook {
  /** Başlatılacak iş: `{ kind: "plan" }`, `{ kind: "routine", dryRun: true }`, `{ kind: "collect", limit: 10 }` … Onay burada verilmez. */
  request: JobRequest;
  /** Düğme metni; verilmezse türün düz dil adı ("Planı hazırla"), önizlemede "Önce bak". */
  label?: string;
}

export interface RunJobButtonProps extends JobButtonOptions {
  /** Sunucudan gelen bağlam (`loadJobRunContext()`): iş durumu tohumu + harcama bilgisi. */
  context: JobRunContext;
}

const isPreview = (request: JobRequest): boolean => "dryRun" in request && request.dryRun === true;

/** Düğmenin varsayılan metni (sözlükten). */
export function defaultJobLabel(request: JobRequest): string {
  return isPreview(request) ? JOB_PREVIEW_LABEL : JOB_KIND_PLAIN[request.kind].label;
}

/**
 * İş başlatan düğme (istemci yaprağı). Para harcamayan iş basınca sıraya yazılır; para harcayan iş (`collect`, `measure` gerçek koşusu)
 * önce onay penceresini açar. Bekleme düğmenin üstünde, ilerleme ve sonuç altında düz dille yazılır; iş açılamazsa sebep + "Tekrar dene".
 * Çalışma alanında başka iş sürerken kapalıdır. YALNIZ işler başlatılabiliyorken çizilir: sunucu bileşenlerinde bunun yerine `JobAction`
 * kullanılır (kapıyı o denetler ve bağlamı kendisi okur).
 */
export function RunJobButton({ request, label, context, ...look }: RunJobButtonProps) {
  const text = label ?? defaultJobLabel(request);
  if ((request.kind === "collect" || request.kind === "measure") && jobRequiresApproval(request.kind, isPreview(request))) {
    return <ApprovedJobButton request={request} label={text} context={context} {...look} />;
  }
  return <DirectJobButton request={request} label={text} context={context} {...look} />;
}

function DirectJobButton({ request, label, context, ...look }: RunJobButtonProps & { label: string }) {
  const run = useJobRun(context.seed);
  const press = () => void run.start(request);
  return <JobButtonFrame {...look} label={label} run={run} onPress={press} onRetry={press} />;
}
