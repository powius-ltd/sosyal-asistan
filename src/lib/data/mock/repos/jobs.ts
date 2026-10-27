/**
 * Mock depo: panel işleri (`PanelRepository` iş metotları). Kurallar Supabase ile AYNI: girdi `job-input.ts`, onay `availableApprovalBases`,
 * çalışma alanı başına tek etkin iş, yanıt vermeyen işin kapatılması (`jobStaleness`), bitmiş işin donması. İş KOŞTURULMAZ (mock'ta işçi
 * yok): yeni iş sırada kalır. İşçi rolü (`claim`, `finish`) yalnız sözleşme testleri içindir, depo arayüzünde yoktur.
 */
import { assertJobApprovalAllowed, jobCreditHold, parseRequestJobInput } from "@/lib/data/job-input";
import { clampLimit, toArray } from "@/lib/data/mock/mock-filters";
import { MOCK_WORKER_ID } from "@/lib/data/mock/generators/jobs";
import type { MockContext } from "@/lib/data/mock/repos/context";
import type { MockCredits } from "@/lib/data/mock/repos/credits";
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import { onboardingRequestProblem } from "@/lib/data/views/onboarding";
import { jobCreditKey } from "@/lib/domain/job-credits";
import { isActiveJob, jobStaleness, type PanelJob } from "@/lib/domain/panel-job";
import { MOCK_USER_ID } from "@/lib/workspace/current";

export type JobMethods = Pick<PanelRepository, "requestJob" | "listJobs" | "getJob" | "cancelJob">;

export interface MockJobs {
  methods: JobMethods;
  /** İŞÇİ ROLÜ (test): kuyruğun en eski sıradaki işini alır (`running`); alınan işin kimliği, iş yoksa undefined. */
  claim(): string | undefined;
  /** İŞÇİ ROLÜ (test): aldığı işi `succeeded` olarak bitirir. */
  finish(jobId: string): void;
}

export function createJobs(ctx: MockContext, credits: Pick<MockCredits, "reserve" | "release">): MockJobs {
  const { state, clock, ws, inWs, requireWs, findOrThrow, nextId, out } = ctx;

  /** İşi başlamadan / işçisiz kapatan yollar açık ayırmayı da bırakır (DB'de `release_panel_job_credits`). Krediye bağlı olmayan işte iş yok. */
  const releaseCredits = (job: PanelJob): void => {
    if (job.approval?.maxCredits !== undefined) credits.release(jobCreditKey(job.id));
  };

  /** Yanıt vermeyen işi kapatır (DB'de `close_stale_panel_jobs`): yalnız istek ve iptal anında çağrılır. */
  function closeIfStale(job: PanelJob): boolean {
    if (!jobStaleness(job, new Date(clock.nowMs)).stale) return false;
    job.status = "failed";
    job.finishedAt = clock.tick();
    job.error = "worker_lost: işçi yanıt vermedi";
    job.result = { ...job.result, outcome: "worker_lost" };
    releaseCredits(job);
    return true;
  }

  const methods: JobMethods = {
    async requestJob(wsId, input) {
      const request = parseRequestJobInput(input);
      requireWs(wsId);
      assertJobApprovalAllowed(request, ws);
      for (const job of state.jobs) closeIfStale(job);
      if (state.jobs.some(isActiveJob)) {
        throw new RepositoryError("already_exists", "Bu çalışma alanında zaten sırada ya da çalışan bir iş var.");
      }
      // Başlangıç işi: deneme sınırı, bakış bitmeden ilk tur yok, hesap başına tek ilk tur (DB'de migration 0021 trigger + indeks).
      const onboardingProblem = request.params.phase === undefined ? undefined : onboardingRequestProblem(state.jobs, request.params.phase);
      if (onboardingProblem !== undefined) throw new RepositoryError(onboardingProblem.code, onboardingProblem.message);
      // Kredi (yalnız zorlama açıkken): ayırma iş satırından ÖNCE denenir; yetmezse `insufficient_credits` ve iş yazılmaz (DB'de tek transaction).
      const maxCredits = jobCreditHold(request, ctx.creditsEnforced);
      const id = nextId("job");
      if (maxCredits !== undefined) credits.reserve({ amount: maxCredits, key: jobCreditKey(id), panelJobId: id }, wsId);
      const at = clock.tick();
      const approval = request.approval;
      // Dayanak: USD onayı varsa onunki; yalnız kredi tavanı varsa `credits` (DB ile aynı türetme).
      const basis = approval?.basis ?? (maxCredits === undefined ? undefined : ("credits" as const));
      const job: PanelJob = {
        id,
        workspaceId: wsId,
        queue: ctx.jobQueue,
        kind: request.kind,
        dryRun: request.dryRun,
        params: request.params,
        status: "queued",
        // Onaylayan = oturumdaki kullanıcı, an = istek anı (Supabase'de `request_panel_job` yazar).
        ...(basis === undefined
          ? {}
          : {
              approval: {
                basis,
                ...(approval === undefined || approval.basis === "monthly_cap" ? {} : { maxUsd: approval.maxUsd }),
                ...(maxCredits === undefined ? {} : { maxCredits }),
                approvedBy: MOCK_USER_ID,
                approvedAt: at,
              },
            }),
        steps: [],
        requestedBy: MOCK_USER_ID,
        createdAt: at,
      };
      state.jobs.push(job);
      return out(job);
    },

    async listJobs(wsId, filter = {}) {
      if (!inWs(wsId)) return [];
      const statuses = toArray(filter.status);
      const jobs = state.jobs
        .filter((job) => (statuses === undefined || statuses.includes(job.status)) && (filter.active === undefined || isActiveJob(job) === filter.active))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, clampLimit(filter.limit));
      return out(jobs);
    },

    async getJob(wsId, jobId) {
      if (!inWs(wsId)) return null;
      const job = state.jobs.find((j) => j.id === jobId);
      return job ? out(job) : null;
    },

    async cancelJob(wsId, jobId) {
      requireWs(wsId);
      const job = findOrThrow(state.jobs, jobId, "İş");
      if (job.status === "queued") {
        job.status = "cancelled";
        job.cancelRequestedAt = clock.tick();
        job.finishedAt = job.cancelRequestedAt;
        releaseCredits(job);
      } else if (job.status === "running") {
        // Yanıt vermeyen iş kapanır; canlı işte yalnız istek yazılır (ilk isteğin anı korunur): işçi adım sınırında durur.
        if (!closeIfStale(job)) job.cancelRequestedAt ??= clock.tick();
      } else {
        throw new RepositoryError("invalid_state", `Bitmiş iş durdurulamaz (şu an: ${job.status}).`);
      }
      return out(job);
    },
  };

  return {
    methods,
    claim() {
      if (state.jobs.some((job) => job.status === "running")) return undefined;
      const next = state.jobs.filter((job) => job.status === "queued").sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
      if (!next) return undefined;
      next.status = "running";
      next.workerId = MOCK_WORKER_ID;
      next.startedAt = clock.tick();
      next.heartbeatAt = next.startedAt;
      return next.id;
    },
    finish(jobId) {
      const job = findOrThrow(state.jobs, jobId, "İş");
      if (job.status !== "running") throw new RepositoryError("invalid_state", `Yalnız çalışan iş bitirilebilir (şu an: ${job.status}).`);
      job.status = "succeeded";
      job.finishedAt = clock.tick();
      job.heartbeatAt = job.finishedAt;
      job.result = { ...job.result, exitCode: 0 };
    },
  };
}
