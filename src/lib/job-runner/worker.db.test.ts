/**
 * İşçi · GERÇEK veritabanı (entegrasyon, yerel Supabase): claim → çitli yazım → kapanış, yetim iş (`worker_lost`), panelden iptal ve günlük
 * temizliği gerçek RPC / trigger / kısıtlarla sınanır. KOŞTURULAN ADIMLAR SAHTEDİR (`fakeDeps`): hiçbir toplama, video inceleme ya da yazı
 * aracı çağrısı yapılmaz. Test KENDİ çalışma alanlarını kurar ve siler; kuyruk adları koşuya özgüdür (rastgele sonek): canlı işçi yalnız
 * `panel` kuyruğunu alır, paralel test süreçleri birbirinin işini alamaz. Yerel Supabase kapalıysa ATLANIR.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RequestJobInput } from "@/lib/data/queries";
import { createSupabaseRepository } from "@/lib/data/supabase/supabase-repository";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import { JOB_STALE_AFTER_MS, type PanelJob } from "@/lib/domain/panel-job";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import { createJobSession } from "@/lib/job-runner/job-session";
import { createJobStore, JOB_LOG_RETENTION_MS } from "@/lib/job-runner/job-store";
import { analyzeSummary, fakeDeps, fakeRoutine } from "@/lib/job-runner/test-support";
import { newWorkerId, runWorker } from "@/lib/job-runner/worker";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

const status = await resolveDbTestEnv();
const name = status.env ? "panel işçisi" : `panel işçisi (ATLANDI: ${status.skipReason})`;

describe.skipIf(!status.env)(`${name} · DB`, { timeout: 120_000 }, () => {
  const env = status.env;
  const userId = env?.userId ?? randomUUID();
  const db: AdminClient = createClient<Database>(env?.url ?? "http://127.0.0.1", env?.serviceRoleKey ?? "atlandi", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const tag = randomUUID().slice(0, 8);
  const workspaces = [randomUUID(), randomUUID()];
  const store = createJobStore(db);
  let queues = 0;
  /** Her test kendi kuyruğunda koşar (bir testin çalışan işi diğerinin claim'ini kilitlemesin). */
  const newQueue = () => `isci_${tag}_${++queues}`;
  const repoFor = (queue: string) => createSupabaseRepository({ db, approverUserId: userId, jobQueue: queue });
  const request = (queue: string, wsId: string, input: RequestJobInput) => repoFor(queue).requestJob(wsId, input);
  const read = async (queue: string, wsId: string, jobId: string): Promise<PanelJob> => {
    const job = await repoFor(queue).getJob(wsId, jobId);
    if (job === null) throw new Error("iş okunamadı");
    return job;
  };
  const drain = (queue: string, deps: Partial<JobRunnerDeps>) => runWorker({ mode: "drain", queue, store, deps: fakeDeps(deps), heartbeatMs: 60_000 });

  beforeAll(async () => {
    if (!env) return;
    const created = await db.from("workspaces").insert(workspaces.map((id, index) => ({ id, name: `İşçi testi ${index + 1}`, slug: `isci-${tag}-${index + 1}` })));
    if (created.error) throw new Error(`test çalışma alanları kurulamadı: ${created.error.message}`);
  }, 60_000);

  afterAll(async () => {
    if (!env) return;
    const removed = await db.from("workspaces").delete().in("id", workspaces);
    if (removed.error) throw new Error(`test çalışma alanları silinemedi: ${removed.error.message}`);
  }, 60_000);

  it("boş kuyrukta drain 0 ile çıkar; hiçbir iş koşturulmaz", async () => {
    expect(await drain(newQueue(), {})).toEqual({ code: 0, jobs: 0, reason: "drained" });
  });

  it("drain: sıradaki işleri alır, adımları ve kapanışı satıra yazar, kuyruk boşalınca çıkar", async () => {
    const queue = newQueue();
    const routine = fakeRoutine();
    const preview = await request(queue, workspaces[0], { kind: "routine", dryRun: true });
    const analyze = await request(queue, workspaces[1], { kind: "analyze" });
    const result = await drain(queue, { routineDeps: routine.factory });
    expect(result).toEqual({ code: 0, jobs: 2, reason: "drained" });

    const done = await read(queue, workspaces[0], preview.id);
    expect(done).toMatchObject({ status: "succeeded", dryRun: true, result: { exitCode: 0, estimate: { usd: 0.27 } } });
    expect(done.steps.map((step) => `${step.id}:${step.status}`)).toEqual(["collect:needs_approval", "analyze:pending", "label:pending", "cluster:skipped", "plan:pending", "measure_check:pending", "briefing:pending"]);
    expect(done.workerId).toBeTruthy();
    expect(done.currentStep).toBeUndefined();
    expect(done.logTail).toContain("bitti: succeeded");
    expect(routine.precheck, "önizleme adım koşturmadı").not.toHaveBeenCalled();

    const analyzed = await read(queue, workspaces[1], analyze.id);
    expect(analyzed).toMatchObject({ status: "succeeded", steps: [{ id: "analyze", status: "ok" }], result: { exitCode: 0 } });
    expect(Date.parse(analyzed.finishedAt ?? "")).toBeGreaterThanOrEqual(Date.parse(analyzed.startedAt ?? ""));
  });

  it("eski nabız → worker_lost: sıradaki claim yetim işi kapatır ve yeni işi verir; eski işçinin yazımı 0 satır etkiler ve işçi durur", async () => {
    const queue = newQueue();
    const orphan = await request(queue, workspaces[0], { kind: "analyze" });
    const next = await request(queue, workspaces[1], { kind: "label" });
    const [dead, alive] = [newWorkerId(), newWorkerId()];

    const claimed = await store.claim(queue, dead);
    expect(claimed?.id, "en eski iş alınır").toBe(orphan.id);
    if (claimed === undefined) throw new Error("iş alınamadı");
    expect(await store.claim(queue, alive), "taze nabızlı iş varken ikinci işçi iş alamaz").toBeUndefined();

    // İşçi öldü: nabız eşiğin gerisinde kaldı (işçinin kendi çitli yazımıyla geriye alınır).
    const stale = new Date(Date.now() - JOB_STALE_AFTER_MS - 60_000).toISOString();
    expect((await store.patch({ id: orphan.id, workerId: dead }, { heartbeat_at: stale })).applied).toBe(true);

    const taken = await store.claim(queue, alive);
    expect(taken?.id, "yetim iş kapanınca sıradaki iş verilir").toBe(next.id);
    const closed = await read(queue, workspaces[0], orphan.id);
    expect(closed).toMatchObject({ status: "failed", result: { outcome: "worker_lost" }, workerId: dead });
    expect(closed.error).toContain("worker_lost");
    expect(closed.finishedAt).toBeDefined();

    // Hayata dönen eski işçi: çit 0 satır döndürür, oturum "lost" der, kapanış yazılamaz.
    const session = createJobSession({ store, job: claimed, workerId: dead, softDeadline: new Date(Date.now() + 60_000) });
    await session.beat();
    expect(session.stopReason()).toBe("lost");
    expect(await session.finish({ status: "succeeded" })).toBe(false);
    expect((await read(queue, workspaces[0], orphan.id)).status, "bitmiş iş donmuştur").toBe("failed");

    // Yeni işçi kendi işini bitirir (kuyrukta etkin iş kalmasın).
    const mine = createJobSession({ store, job: taken as PanelJob, workerId: alive, softDeadline: new Date(Date.now() + 60_000) });
    expect(await mine.finish({ status: "succeeded", result: { exitCode: 0 } })).toBe(true);
  });

  it("panelden durdurma: çalışan işte istek nabızla okunur, işçi video sınırında durur, iş cancelled kapanır", async () => {
    const queue = newQueue();
    const job = await request(queue, workspaces[0], { kind: "analyze" });
    const started: number[] = [];
    const analyze: JobRunnerDeps["analyze"] = async (_ctx, args) => {
      for (let video = 1; video <= 4; video++) {
        if ((await args.shouldStop?.()) === true) break;
        started.push(video);
        if (video === 2) await repoFor(queue).cancelJob(workspaces[0], job.id); // yönetici "Durdur"a bastı
        await args.onProgress?.({ done: video, total: 4 });
      }
      return analyzeSummary({ selected: 4, ok: started.length, skippedByCap: 4 - started.length });
    };
    expect(await drain(queue, { analyze })).toMatchObject({ code: 0, jobs: 1 });
    expect(started).toEqual([1, 2]);
    const done = await read(queue, workspaces[0], job.id);
    expect(done).toMatchObject({ status: "cancelled", steps: [{ id: "analyze", status: "ok" }] });
    expect(done.cancelRequestedAt).toBeDefined();
    expect(done.progress).toBeUndefined();
  });

  it("eski iş günlükleri boşaltılır: yalnız bu kuyruk, yalnız saklama süresini aşan bitmiş işler", async () => {
    const queue = newQueue();
    const other = newQueue();
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    const row = (q: string, wsId: string, days: number, log: string) => ({ workspace_id: wsId, queue: q, kind: "plan", status: "cancelled", created_at: daysAgo(days + 1), cancel_requested_at: daysAgo(days), finished_at: daysAgo(days), log_tail: log });
    const inserted = await db.from("panel_jobs").insert([row(queue, workspaces[0], 15, "eski"), row(queue, workspaces[1], 1, "yeni"), row(other, workspaces[0], 15, "başka kuyruk")]).select("id, log_tail");
    if (inserted.error) throw new Error(inserted.error.message);
    expect(await store.clearOldLogTails(queue, new Date(Date.now() - JOB_LOG_RETENTION_MS))).toBe(1);
    const after = await db.from("panel_jobs").select("log_tail").in("id", inserted.data.map((r) => r.id)).order("log_tail");
    expect(after.data?.map((r) => r.log_tail).sort()).toEqual(["başka kuyruk", "yeni", null].sort());
  });
});
