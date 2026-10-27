/**
 * İşçinin YAZDIĞI → durum ucu → ekranın OKUDUĞU (uçtan uca, veritabanısız). İşçi (`runJob`, sahte adımlar) iş satırını yazar; satır okuma
 * eşlemesinden (`toPanelJob`) geçer; durum ucu (`handleJobsStatusRequest`) gerçek JSON yanıtını kurar; ekranın ortak deposu
 * (`JobStatusStore`) yanıtı işler. Sınanan sözleşme: basılan düğme `?id=` ile kendi BİTMİŞ işini `job` alanında bulur; onay penceresi
 * tahmini `view.operator.result.estimate`'ten okur; müşteri görünümünde bu alan hiç yoktur. Gerçek veritabanlı karşılığı:
 * `preview-safety.db.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

import { JobStatusStore, type JobsSnapshot } from "@/components/jobs/job-status-store";
import { toPanelJob, type JobRow } from "@/lib/data/supabase/mappers/job";
import { estimateJobCredits } from "@/lib/domain/credit-pricing";
import { isActiveJob, type PanelJob } from "@/lib/domain/panel-job";
import type { JobsStatusResponse } from "@/lib/domain/panel-job-view";
import { handleJobsStatusRequest } from "@/lib/job-control/status-view";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import { runJob } from "@/lib/job-runner/run-job";
import { claimedJob, fakeDeps, fakeRoutine, fakeStore, NOW, WORKER_ID, WS_ID } from "@/lib/job-runner/test-support";
import { jobsStatusUrl } from "@/lib/routes";

/** İş satırı (DB şekli): sıradaki hâli. İşçinin yamaları bunun üstüne uygulanır. */
const queuedRow = (job: PanelJob): JobRow => ({
  id: job.id,
  workspace_id: job.workspaceId,
  queue: job.queue,
  kind: job.kind,
  dry_run: job.dryRun,
  params: job.params,
  status: "queued",
  approval_basis: null,
  approved_max_usd: null,
    approved_max_credits: null,
  approved_by: null,
  approved_at: null,
  steps: [],
  current_step: null,
  progress: null,
  log_tail: null,
  result: null,
  error: null,
  worker_id: null,
  heartbeat_at: null,
  cancel_requested_at: null,
  requested_by: null,
  created_at: job.createdAt,
  started_at: null,
  finished_at: null,
});

/** İşçi işi alır (`claim_panel_job`'ın yazdıkları) ve koşturur; satırın son hâli döner. */
async function workedRow(job: PanelJob, deps: Partial<JobRunnerDeps> = {}): Promise<JobRow> {
  const fake = fakeStore();
  await runJob(job, { store: fake.store, deps: fakeDeps(deps), workerId: WORKER_ID, clock: () => NOW, clockMs: () => 0, heartbeatMs: 60_000 });
  const claimed: JobRow = { ...queuedRow(job), status: "running", worker_id: WORKER_ID, started_at: NOW.toISOString(), heartbeat_at: NOW.toISOString() };
  return fake.patches.reduce<JobRow>((row, patch) => ({ ...row, ...patch }) as JobRow, claimed);
}

/** Ekran: durum ucunu `fetch` yerine doğrudan çağıran ortak depo. `rows` o anki tabloyu verir (iş ilerledikçe değişir). */
function screen(rows: () => JobRow[], operator: boolean) {
  const jobs = () => rows().flatMap((row) => toPanelJob(row) ?? []);
  const requested: string[] = [];
  const store = new JobStatusStore({
    async fetchStatus(jobId) {
      const url = `http://panel.test${jobsStatusUrl(jobId)}`;
      requested.push(url);
      const response = await handleJobsStatusRequest(new Request(url), {
        getContext: async () => ({
          repo: {
            listJobs: async (_wsId, filter = {}) => jobs().filter((job) => filter.active === undefined || isActiveJob(job) === filter.active),
            getJob: async (_wsId, jobId) => jobs().find((job) => job.id === jobId) ?? null,
          },
          wsId: WS_ID,
          now: NOW,
        }),
        operator: () => operator,
        canKick: () => false,
      });
      expect(response.status).toBe(200);
      return JSON.parse(await response.text()) as JobsStatusResponse; // ağdan geçen gerçek gövde
    },
    setTimer: () => undefined,
    clearTimer: () => undefined,
    isVisible: () => true,
    onVisibilityChange: () => () => undefined,
  });
  store.seed(WS_ID, { workerNeeded: false });
  const settle = async (check: (snapshot: JobsSnapshot) => void) => {
    await vi.waitFor(() => check(store.getSnapshot()));
    return store.getSnapshot();
  };
  return { store, requested, settle };
}

describe("işçinin yazdığı → durum ucu → ekran deposu", () => {
  it("toplama tahmini: düğme işini sırada görür, bitince `job` alanından son hâlini ve tahmini okur (yönetici)", async () => {
    const job = claimedJob({ kind: "collect", dryRun: true, params: { limit: 5 } });
    let table: JobRow[] = [queuedRow(job)];
    const ui = screen(() => table, true);

    ui.store.follow(job.id);
    const waiting = await ui.settle((snapshot) => expect(snapshot.active?.id).toBe(job.id));
    expect(waiting).toMatchObject({ active: { kind: "collect", dryRun: true, status: "queued" }, settled: {} });
    expect(waiting.pendingId, "ilk yanıttan sonra iş artık 'bekleyen' değil").toBeUndefined();
    expect(ui.requested.at(-1)).toBe(`http://panel.test/api/isler?id=${job.id}`);

    table = [await workedRow(job)];
    ui.store.refresh();
    const done = await ui.settle((snapshot) => expect(snapshot.settled[job.id]).toBeDefined());
    expect(done.active).toBeUndefined();
    expect(done.lastFinished).toMatchObject({ id: job.id, status: "succeeded", dryRun: true });
    const view = done.settled[job.id];
    // Onay penceresinin okuduğu yol: `view.operator?.result?.estimate`.
    expect(view.operator?.result?.estimate).toEqual({ usd: 0.11, lines: [{ label: "profil (2 hesap)", usd: 0.01 }, { label: "@test.hesap", usd: 0.1 }], units: { accounts: 2 } });
    // Kredi tahmini aynı yoldan okunur (işçi birim sayısını yazar, ekran saf fonksiyonla hesaplar): 2 hesap × 8.
    expect(estimateJobCredits("collect", view.operator?.result?.estimate?.units)?.maxCredits).toBe(16);
    expect(view.operator?.result?.spend, "önizlemede harcama yok").toBeUndefined();
    expect(view.steps).toEqual([{ id: "collect", status: "ok" }]);
    expect(view.operator?.steps[0]).toMatchObject({ spend: { estimateUsd: 0.11 } });
    expect(view.operator?.params).toEqual({ limit: 5 });
    expect(view.operator?.logTail).toContain("bitti: succeeded");
  });

  it("ölçüm ve haftalık tur önizlemesi de tahmini aynı alanda taşır", async () => {
    const measure = claimedJob({ id: "44444444-4444-4444-8444-444444444444", kind: "measure", dryRun: true });
    const routine = claimedJob({ id: "55555555-5555-4555-8555-555555555555", kind: "routine", dryRun: true });
    const table = [await workedRow(measure), await workedRow(routine, { routineDeps: fakeRoutine().factory })];
    const ui = screen(() => table, true);

    ui.store.follow(measure.id);
    const first = await ui.settle((snapshot) => expect(snapshot.settled[measure.id]).toBeDefined());
    expect(first.settled[measure.id].operator?.result?.estimate).toMatchObject({ usd: 0.04, lines: [{ label: "@test.hesap", usd: 0.04 }] });

    ui.store.follow(routine.id);
    const second = await ui.settle((snapshot) => expect(snapshot.settled[routine.id]).toBeDefined());
    expect(second.settled[routine.id].operator?.result?.estimate?.usd).toBe(0.27);
    expect(second.settled[routine.id].steps.find((step) => step.id === "collect")).toEqual({ id: "collect", status: "needs_approval" });
  });

  it("müşteri görünümü: aynı iş durum ve adımlarıyla gelir; tahmin, tutar, not, günlük HİÇ gelmez", async () => {
    const job = claimedJob({ kind: "collect", dryRun: true });
    const table = [await workedRow(job)];
    const ui = screen(() => table, false);

    ui.store.follow(job.id);
    const done = await ui.settle((snapshot) => expect(snapshot.settled[job.id]).toBeDefined());
    expect(done.settled[job.id]).toMatchObject({ id: job.id, kind: "collect", dryRun: true, status: "succeeded", steps: [{ id: "collect", status: "ok" }] });
    expect(done.settled[job.id]).not.toHaveProperty("operator");
    expect(JSON.stringify(done)).not.toMatch(/estimate|usd|0[.,]11|logTail|note|profil|test\.hesap/i);
  });

  it("biçimsiz ya da başka işin kimliği: `job` alanı gelmez, düğme işi izleyemez ama takılı kalmaz", async () => {
    const job = claimedJob({ kind: "collect", dryRun: true });
    const table = [await workedRow(job)];
    const ui = screen(() => table, true);

    ui.store.follow("66666666-6666-4666-8666-666666666666");
    const snapshot = await ui.settle((current) => expect(current.pendingId).toBeUndefined());
    expect(snapshot).toMatchObject({ settled: {}, workerNeeded: false });
    expect(snapshot.active).toBeUndefined();
  });
});
