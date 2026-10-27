/**
 * Panel işleri (Supabase): `requestJob`, `listJobs`, `getJob`, `cancelJob`. Depo iş KOŞTURMAZ: yalnız satır yazar / okur; işi ayrık işçi
 * alır (`claim_panel_job`). Kurallar DB'dedir (migration 0016): yetim işi kapatma + tek etkin iş `request_panel_job`'ta, iptal kuralları
 * `cancel_panel_job`'ta, onaysız harcama CHECK'te, kredi ayırması `request_panel_job_credited`'te (0020; iş satırıyla atomik); burada girdi mock ile AYNI sırayla doğrulanır (girdi → çalışma alanı → onay) ve hata
 * `toRepositoryError` ile çevrilir (etkin iş → `already_exists`, bitmiş iş → `invalid_state`, iş yok → `not_found`, kısıt → `invalid_input`).
 * İşler `ctx.jobQueue` kuyruğuna yazılır (panelde `panel`; testte test kuyruğu); onaylayan / isteyen `ctx.approverUserId`.
 * Her okuma açıkça `workspace_id` süzgeçlidir; biçimsiz kimlik sorguya gitmez (bulunamadı sayılır).
 */
import { assertJobApprovalAllowed, jobCreditHold, parseRequestJobInput } from "@/lib/data/job-input";
import { requestPanelJobArgs } from "@/lib/data/job-schema";
import { RepositoryError } from "@/lib/data/repository";
import { isUuid, unwrap } from "@/lib/data/supabase/errors";
import { JOB_COLUMNS, toPanelJob, type JobRow } from "@/lib/data/supabase/mappers/job";
import type { SupabaseMethod } from "@/lib/data/supabase/not-implemented";
import { clampLimit } from "@/lib/data/supabase/paging";
import { getWorkspace } from "@/lib/data/supabase/workspace";
import { ACTIVE_JOB_STATUSES, JOB_STATUSES, type PanelJob } from "@/lib/domain/panel-job";

/** RPC'nin döndürdüğü satır her zaman eşlenebilir (tür / durum DB check'inden); eşlenemiyorsa şema ile domain ayrışmıştır. */
function mapped(row: JobRow): PanelJob {
  const job = toPanelJob(row);
  if (job === undefined) throw new Error(`panel_jobs satırı eşlenemedi (bilinmeyen tür ya da durum): ${row.id}`);
  return job;
}

export const requestJob: SupabaseMethod<"requestJob"> = async (ctx, wsId, input) => {
  const request = parseRequestJobInput(input);
  const workspace = isUuid(wsId) ? await getWorkspace(ctx, wsId) : null;
  if (workspace === null) throw new RepositoryError("not_found", "Workspace bulunamadı.");
  assertJobApprovalAllowed(request, workspace);
  // Kredi (yalnız zorlama açıkken): ayırma iş satırıyla AYNI transaction'dadır; yetmezse `insufficient_credits` ve iş satırı da yazılmaz.
  const maxCredits = jobCreditHold(request, ctx.creditsEnforced);
  const hold = maxCredits === undefined ? undefined : { ownerUserId: ctx.creditOwnerUserId, maxCredits };
  return mapped(unwrap(await ctx.db.rpc("request_panel_job_credited", requestPanelJobArgs(wsId, ctx.jobQueue, request, ctx.approverUserId, hold))));
};

export const listJobs: SupabaseMethod<"listJobs"> = async (ctx, wsId, filter = {}) => {
  if (!isUuid(wsId)) return [];
  const wanted = filter.status === undefined ? [...JOB_STATUSES] : Array.isArray(filter.status) ? filter.status : [filter.status];
  const active: readonly string[] = ACTIVE_JOB_STATUSES;
  const statuses = wanted.filter((status) => filter.active === undefined || active.includes(status) === filter.active);
  if (statuses.length === 0) return [];
  const rows = unwrap(
    await ctx.db
      .from("panel_jobs")
      .select(JOB_COLUMNS)
      .eq("workspace_id", wsId)
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(clampLimit(filter.limit)),
  );
  return rows.flatMap((row) => toPanelJob(row) ?? []);
};

export const getJob: SupabaseMethod<"getJob"> = async (ctx, wsId, jobId) => {
  if (!isUuid(wsId) || !isUuid(jobId)) return null;
  const row = unwrap(await ctx.db.from("panel_jobs").select(JOB_COLUMNS).eq("workspace_id", wsId).eq("id", jobId).maybeSingle());
  return row === null ? null : (toPanelJob(row) ?? null);
};

export const cancelJob: SupabaseMethod<"cancelJob"> = async (ctx, wsId, jobId) => {
  if (!isUuid(wsId) || !isUuid(jobId)) throw new RepositoryError("not_found", "İş bulunamadı.");
  return mapped(unwrap(await ctx.db.rpc("cancel_panel_job", { p_ws: wsId, p_job: jobId })));
};
