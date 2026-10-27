/**
 * Panel işi satırı (`panel_jobs`) → `PanelJob`. jsonb sütunları yazanla AYNI zod şemalarıyla doğrulanır (`lib/data/job-schema.ts`).
 * Brifingin tersine iş satırı GİZLENMEZ: jsonb'si bozuk iş de listede kalır (etkin iş görünmezse ekran "iş yok" der ama DB yeni isteği
 * reddeder). Bozuk parça güvenli boşa düşer: adımlar → geçerli olanlar, sayaç / sonuç → yok, parametre → boş. Bilinmeyen tür / durum
 * (DB check'i dışı: olamaz) → `undefined`. NULL → `undefined` (tutar, sayaç: 0 değil).
 */
import { jobParamsSchema, jobProgressSchema, jobResultSchema, jobStepSchema } from "@/lib/data/job-schema";
import { iso, isoOpt, opt, validEntries } from "@/lib/data/supabase/mappers/common";
import { JOB_APPROVAL_BASES, JOB_KINDS, JOB_STATUSES, JOB_STEP_IDS, type JobApproval, type PanelJob } from "@/lib/domain/panel-job";
import type { Tables } from "@/lib/supabase/database.types";

export const JOB_COLUMNS =
  "id, workspace_id, queue, kind, dry_run, params, status, approval_basis, approved_max_usd, approved_max_credits, approved_by, approved_at, steps, current_step, progress, log_tail, result, error, worker_id, heartbeat_at, cancel_requested_at, requested_by, created_at, started_at, finished_at" as const;

export type JobRow = Tables<"panel_jobs">;

function toApproval(row: JobRow): JobApproval | undefined {
  const basis = JOB_APPROVAL_BASES.find((b) => b === row.approval_basis);
  if (basis === undefined || row.approved_by === null || row.approved_at === null) return undefined;
  return {
    basis,
    ...(row.approved_max_usd === null ? {} : { maxUsd: row.approved_max_usd }),
    ...(row.approved_max_credits === null ? {} : { maxCredits: row.approved_max_credits }),
    approvedBy: row.approved_by,
    approvedAt: iso(row.approved_at),
  };
}

export function toPanelJob(row: JobRow): PanelJob | undefined {
  const kind = JOB_KINDS.find((k) => k === row.kind);
  const status = JOB_STATUSES.find((s) => s === row.status);
  if (kind === undefined || status === undefined) return undefined;
  const params = jobParamsSchema.safeParse(row.params);
  const progress = jobProgressSchema.safeParse(row.progress);
  const result = jobResultSchema.safeParse(row.result);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    queue: row.queue,
    kind,
    dryRun: row.dry_run,
    params: params.success ? params.data : {},
    status,
    approval: toApproval(row),
    steps: validEntries(row.steps, jobStepSchema),
    currentStep: JOB_STEP_IDS.find((id) => id === row.current_step),
    progress: progress.success ? progress.data : undefined,
    logTail: opt(row.log_tail),
    result: result.success ? result.data : undefined,
    error: opt(row.error),
    workerId: opt(row.worker_id),
    heartbeatAt: isoOpt(row.heartbeat_at),
    cancelRequestedAt: isoOpt(row.cancel_requested_at),
    requestedBy: opt(row.requested_by),
    createdAt: iso(row.created_at),
    startedAt: isoOpt(row.started_at),
    finishedAt: isoOpt(row.finished_at),
  };
}
