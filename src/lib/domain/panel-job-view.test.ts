import { describe, expect, it } from "vitest";

import { buildJobs } from "@/lib/data/mock/generators/jobs";
import { createClock } from "@/lib/data/mock/mock-clock";
import { JOB_KICK_AFTER_MS, JOB_STALE_AFTER_MS, type PanelJob } from "@/lib/domain/panel-job";
import { toJobsStatusResponse, toJobStatusView } from "@/lib/domain/panel-job-view";

const clock = createClock();
const NOW = new Date(clock.nowMs);
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const seeds = buildJobs(clock);
const blocked = seeds.find((job) => job.status === "blocked") as PanelJob;

const running = (patch: Partial<PanelJob> = {}): PanelJob => ({
  id: "job_x",
  workspaceId: "ws",
  queue: "panel",
  kind: "analyze",
  dryRun: false,
  params: {},
  status: "running",
  steps: [{ id: "analyze", status: "running", note: "[7/19] agy çağrısı", seconds: 12, spend: { estimateUsd: 0.4 } }],
  currentStep: "analyze",
  progress: { done: 7, total: 19 },
  logTail: "Apify koşusu 0,12 USD",
  workerId: "w1",
  heartbeatAt: ago(5_000),
  createdAt: ago(60_000),
  startedAt: ago(55_000),
  ...patch,
});

describe("toJobStatusView", () => {
  it("müşteri görünümü: durum, adım durumu, sayaç ve sonuç kodu; tutar / sağlayıcı / günlük / ham not / hata YOK", () => {
    for (const job of [...seeds, running(), running({ error: "Apify 402", approval: { basis: "one_time", maxUsd: 0.5, approvedBy: "u", approvedAt: ago(1000) } })]) {
      const view = toJobStatusView(job, { now: NOW, operator: false });
      expect(view.operator, job.id).toBeUndefined();
      const text = JSON.stringify(view);
      // Yönetici alanlarının anahtarı da (ham not, günlük, onay, sonuç, parametre …) değeri de (tutar, sağlayıcı adı) geçmez.
      expect(text, job.id).not.toMatch(/"(note|seconds|spend|logTail|error|approval|result|params|workerId|heartbeatAt|requestedBy|queue|workspaceId)":/);
      expect(text, job.id).not.toMatch(/usd|apify|\bagy\b|docs\//i);
      expect(Object.keys(view).sort(), `${job.id}: yalnız bilinen alanlar`).toEqual(
        expect.arrayContaining(["id", "kind", "dryRun", "status", "stale", "cancelRequested", "steps", "createdAt"]),
      );
      for (const step of view.steps) expect(Object.keys(step).every((key) => ["id", "status", "code"].includes(key)), job.id).toBe(true);
    }
    const view = toJobStatusView(blocked, { now: NOW, operator: false });
    expect(view).toMatchObject({ status: "blocked", outcome: "over_approved_amount", stale: false, cancelRequested: false });
    expect(view.steps).toEqual([{ id: "collect", status: "needs_approval", code: "over_approved_amount" }]);
  });

  it("yönetici görünümü işin tamamını taşır (onay, ham not, günlük)", () => {
    const view = toJobStatusView(blocked, { now: NOW, operator: true });
    expect(view.operator).toEqual(blocked);
    expect(view.operator?.approval?.maxUsd).toBe(0.1);
  });

  it("çalışan iş: adım ve sayaç görünür; nabzı kesilen iş bayat; durdurma isteği yalnız etkin işte", () => {
    expect(toJobStatusView(running(), { now: NOW, operator: false })).toMatchObject({ stale: false, cancelRequested: false, currentStep: "analyze", progress: { done: 7, total: 19 } });
    expect(toJobStatusView(running({ heartbeatAt: ago(JOB_STALE_AFTER_MS + 1) }), { now: NOW, operator: false }).stale).toBe(true);
    expect(toJobStatusView(running({ cancelRequestedAt: ago(1000) }), { now: NOW, operator: false }).cancelRequested).toBe(true);
    const cancelled = seeds.find((job) => job.status === "cancelled") as PanelJob;
    expect(toJobStatusView(cancelled, { now: NOW, operator: false })).toMatchObject({ status: "cancelled", cancelRequested: false, stale: false });
    // Sayaç / adım yoksa alan hiç yazılmaz (0/0 uydurulmaz).
    expect(toJobStatusView(cancelled, { now: NOW, operator: false })).not.toHaveProperty("progress");
    expect(toJobStatusView(cancelled, { now: NOW, operator: false })).not.toHaveProperty("currentStep");
  });
});

describe("toJobsStatusResponse", () => {
  it("etkin iş yoksa alan yok; istenen iş `job`'da döner; işçi dürtme yalnız yönetici modunda ve bekleyen işte", () => {
    expect(toJobsStatusResponse({ jobs: seeds, now: NOW, operator: true })).toEqual({ workerNeeded: false });
    const withJob = toJobsStatusResponse({ jobs: seeds, requested: blocked, now: NOW, operator: false });
    expect(withJob.job?.id).toBe(blocked.id);
    expect(withJob.job?.operator).toBeUndefined();
    expect(toJobsStatusResponse({ jobs: seeds, requested: null, now: NOW, operator: false })).toEqual({ workerNeeded: false });

    const queued: PanelJob = { id: "job_q", workspaceId: "ws", queue: "panel", kind: "plan", dryRun: false, params: {}, status: "queued", steps: [], createdAt: ago(JOB_KICK_AFTER_MS + 1) };
    expect(toJobsStatusResponse({ jobs: [...seeds, queued], now: NOW, operator: true })).toMatchObject({ active: { id: "job_q", status: "queued" }, workerNeeded: true });
    expect(toJobsStatusResponse({ jobs: [queued], now: NOW, operator: false }).workerNeeded, "müşteri işçi dürtemez").toBe(false);
    expect(toJobsStatusResponse({ jobs: [{ ...queued, createdAt: ago(1000) }], now: NOW, operator: true }).workerNeeded, "yeni istenen iş bekletilir").toBe(false);
    expect(toJobsStatusResponse({ jobs: [running()], now: NOW, operator: true })).toMatchObject({ active: { status: "running" }, workerNeeded: false });
  });
});
