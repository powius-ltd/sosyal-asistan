/**
 * İş ekranı testlerinin ortak örnekleri (yalnız testler içe aktarır): her durumdan bir iş + görünüme çevirme. Gerçek iş açılmaz, depo
 * kullanılmaz; saat sabittir. Yönetici notlarında bilerek sağlayıcı adı ve tutar geçer: müşteri görünümüne sızmadığı bunlarla sınanır.
 */
import type { JobRunContext, JobsSeed } from "@/components/jobs/job-run-types";
import { costView } from "@/lib/cost";
import type { PanelJob } from "@/lib/domain/panel-job";
import { toJobsStatusResponse, toJobStatusView, type JobStatusView } from "@/lib/domain/panel-job-view";

export const FIXTURE_NOW = new Date("2026-10-05T12:00:00.000Z");
export const FIXTURE_SCOPE = "ws_fixture";
export const FIXTURE_TZ = "Europe/Istanbul";

const minutesAgo = (minutes: number): string => new Date(FIXTURE_NOW.getTime() - minutes * 60_000).toISOString();

const base = { workspaceId: FIXTURE_SCOPE, queue: "fixture", dryRun: false, params: {}, steps: [], requestedBy: "user_fixture" } satisfies Partial<PanelJob>;

export const QUEUED_JOB: PanelJob = { ...base, id: "job_queued", kind: "plan", status: "queued", createdAt: minutesAgo(0.1) };

export const RUNNING_JOB: PanelJob = {
  ...base,
  id: "job_running",
  kind: "routine",
  status: "running",
  approval: { basis: "one_time", maxUsd: 0.15, approvedBy: "user_fixture", approvedAt: minutesAgo(3) },
  steps: [
    { id: "precheck", status: "ok", note: "Ortam tamam; 2 eski koşu kapatıldı.", seconds: 3.2 },
    { id: "collect", status: "needs_approval", note: "Apify parası harcar; onay yok.", seconds: 0, spend: { estimateUsd: 0.11 } },
    { id: "analyze", status: "running", note: "agy ile video analizi sürüyor." },
    { id: "label", status: "pending" },
    { id: "cluster", status: "skipped", code: "skipped_account_type" },
    { id: "plan", status: "pending" },
    { id: "measure_check", status: "pending" },
    { id: "briefing", status: "pending" },
  ],
  currentStep: "analyze",
  progress: { done: 7, total: 19 },
  logTail: "— analyze: run\n[7/19] video analizi",
  workerId: "worker_fixture",
  heartbeatAt: minutesAgo(0.1),
  createdAt: minutesAgo(3),
  startedAt: minutesAgo(2.9),
};

/** Çalışıyor görünen ama nabzı 10 dk önce kesilen iş: "yanıt vermiyor". */
export const STALE_JOB: PanelJob = { ...RUNNING_JOB, id: "job_stale", heartbeatAt: minutesAgo(10) };

export const SUCCEEDED_JOB: PanelJob = {
  ...base,
  id: "job_succeeded",
  kind: "briefing",
  status: "succeeded",
  steps: [{ id: "briefing", status: "ok", note: "5 madde (41 sn).", seconds: 41 }],
  result: { exitCode: 0 },
  createdAt: minutesAgo(60),
  startedAt: minutesAgo(59.9),
  finishedAt: minutesAgo(59.2),
};

export const PARTIAL_JOB: PanelJob = {
  ...base,
  id: "job_partial",
  kind: "routine",
  status: "partial",
  steps: [
    { id: "precheck", status: "ok", seconds: 2 },
    { id: "analyze", status: "failed", code: "backend_unavailable", note: "Video analizi arka ucu (agy) kullanılamıyor: kota doldu.", seconds: 12.4 },
    { id: "plan", status: "ok", seconds: 200 },
  ],
  result: { outcome: "step_failed", exitCode: 4, reportPath: "docs/rutin/ornek/2026-10-01.md" },
  createdAt: minutesAgo(120),
  startedAt: minutesAgo(119.9),
  finishedAt: minutesAgo(113),
};

export const BLOCKED_JOB: PanelJob = {
  ...base,
  id: "job_blocked",
  kind: "collect",
  params: { limit: 10 },
  status: "blocked",
  approval: { basis: "one_time", maxUsd: 0.1, approvedBy: "user_fixture", approvedAt: minutesAgo(200) },
  steps: [{ id: "collect", status: "needs_approval", code: "over_approved_amount", note: "Tahmini toplam 0,13 USD, onaylı tavan 0,10 USD.", seconds: 5.1, spend: { estimateUsd: 0.13 } }],
  result: { outcome: "over_approved_amount", estimate: { usd: 0.13, lines: [{ label: "Kendi hesap: içerik (10)", usd: 0.052 }] } },
  createdAt: minutesAgo(200),
  startedAt: minutesAgo(199.9),
  finishedAt: minutesAgo(199.8),
};

export const FAILED_JOB: PanelJob = {
  ...base,
  id: "job_failed",
  kind: "analyze",
  status: "failed",
  steps: [{ id: "analyze", status: "running" }],
  currentStep: "analyze",
  progress: { done: 7, total: 19 },
  result: { outcome: "worker_lost" },
  error: "worker_lost: işçi yanıt vermedi",
  logTail: "[7/19] video analizi",
  createdAt: minutesAgo(300),
  startedAt: minutesAgo(299.9),
  finishedAt: minutesAgo(290),
};

/** Sıradayken durdurulan iş: hiç alınmadı (adım, başlangıç yok). */
export const CANCELLED_JOB: PanelJob = { ...base, id: "job_cancelled", kind: "plan", status: "cancelled", createdAt: minutesAgo(400), cancelRequestedAt: minutesAgo(399), finishedAt: minutesAgo(399) };

/** Biten $0 tahmin işi (onay penceresinin okuduğu sonuç). */
export const ESTIMATE_JOB: PanelJob = {
  ...base,
  id: "job_estimate",
  kind: "collect",
  dryRun: true,
  status: "succeeded",
  steps: [{ id: "collect", status: "ok", note: "Kuru koşu: 5 hesap, tahmini toplam 0,13 USD.", seconds: 4.8, spend: { estimateUsd: 0.13 } }],
  result: {
    exitCode: 0,
    estimate: {
      usd: 0.13,
      lines: [
        { label: "Kendi hesap: içerik (10)", usd: 0.052 },
        { label: "İzlenen rakipler: içerik (4 × 10)", usd: 0.078 },
      ],
      units: { accounts: 5 },
    },
  },
  createdAt: minutesAgo(1),
  startedAt: minutesAgo(0.9),
  finishedAt: minutesAgo(0.8),
};

/** Müşteri görünümü varsayılandır; `operator: true` yönetici ayrıntısını ekler. */
export function viewOf(job: PanelJob, options: { operator?: boolean } = {}): JobStatusView {
  return toJobStatusView(job, { now: FIXTURE_NOW, operator: options.operator ?? false });
}

/** Sunucu tohumu: `active` verilirse etkin iş odur. */
export function seedOf(active?: PanelJob, options: { operator?: boolean; scope?: string } = {}): JobsSeed {
  return {
    scope: options.scope ?? FIXTURE_SCOPE,
    status: toJobsStatusResponse({ jobs: active ? [active] : [], now: FIXTURE_NOW, operator: options.operator ?? false }),
  };
}

/** Yönetici bağlamı: aylık Apify sınırı 10 USD, bu ay 1,20 USD harcanmış; `measureCapUsd` verilirse ölçüm sınırı onaylıdır. */
export function contextOf(options: { active?: PanelJob; apifyCapUsd?: number; measureCapUsd?: number; spend?: false } = {}): JobRunContext {
  const apifyCapUsd = options.apifyCapUsd ?? 10;
  const seed = seedOf(options.active, { operator: true });
  if (options.spend === false) return { seed };
  return {
    seed,
    spend: {
      caps: { apifyMonthlyCapUsd: apifyCapUsd, ...(options.measureCapUsd === undefined ? {} : { measureMonthlyCapUsd: options.measureCapUsd }) },
      month: costView({ capUsd: apifyCapUsd, committedUsd: 1.5, actualUsd: 1.2, runs: 4, unreconciledRuns: 1, priceUnknownRuns: 0 }),
    },
  };
}
