/**
 * İş ↔ kredi · GERÇEK veritabanı (entegrasyon, yerel Supabase): iş isteğinde atomik ayırma, eşzamanlı istek / claim yarışı ("iş kuyrukta ama
 * kredisi ayrılmamış" penceresi yok), işçinin kesinleştirmesi, işçi kaybında ayırmanın bırakılması, işçi başı süpürme ve zorlama kapalıyken
 * hiçbir defter yazımı olmaması. KOŞTURULAN ADIMLAR SAHTEDİR (`fakeDeps`): hiçbir toplama, video inceleme ya da yazı aracı çağrılmaz.
 * Test KENDİ çalışma alanlarını, KENDİ kuyruklarını (koşuya özgü ad) ve KENDİ kredi kullanıcısını kurar ve siler: canlı `panel` kuyruğuna ve
 * yerel kullanıcının gerçek bakiyesine YAZMAZ. Yerel Supabase kapalıysa ATLANIR.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { grantCredits, listCreditEntries, readCreditBalance, readCreditHold } from "@/lib/credits/ledger";
import type { RequestJobInput } from "@/lib/data/queries";
import { createSupabaseRepository } from "@/lib/data/supabase/supabase-repository";
import { createCreditTestUser, deleteCreditTestUser } from "@/lib/data/supabase/testing/credit-user";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import { CREDIT_PRICE_VERSION } from "@/lib/domain/credit-pricing";
import { jobCreditKey } from "@/lib/domain/job-credits";
import { JOB_STALE_AFTER_MS, type PanelJob } from "@/lib/domain/panel-job";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import { createJobStore } from "@/lib/job-runner/job-store";
import { createRealJobCredits } from "@/lib/job-runner/real-credits";
import { analyzeSummary, fakeDeps } from "@/lib/job-runner/test-support";
import { newWorkerId, runWorker } from "@/lib/job-runner/worker";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

const status = await resolveDbTestEnv();
const name = status.env ? "iş ↔ kredi" : `iş ↔ kredi (ATLANDI: ${status.skipReason})`;

describe.skipIf(!status.env)(`${name} · DB`, { timeout: 120_000 }, () => {
  const env = status.env;
  const userId = env?.userId ?? randomUUID();
  const db: AdminClient = createClient<Database>(env?.url ?? "http://127.0.0.1", env?.serviceRoleKey ?? "atlandi", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const tag = randomUUID().slice(0, 8);
  const workspaces = [randomUUID(), randomUUID()];
  const store = createJobStore(db);
  let creditUserId: string = randomUUID();
  let queues = 0;
  const newQueue = () => `kredi_${tag}_${++queues}`;
  const repoFor = (queue: string, enforced: boolean) => createSupabaseRepository({ db, approverUserId: userId, creditOwnerUserId: creditUserId, jobQueue: queue, creditsEnforced: enforced });
  const request = (queue: string, wsId: string, input: RequestJobInput, enforced = true) => repoFor(queue, enforced).requestJob(wsId, input);
  const read = async (queue: string, wsId: string, jobId: string): Promise<PanelJob> => {
    const job = await repoFor(queue, true).getJob(wsId, jobId);
    if (job === null) throw new Error("iş okunamadı");
    return job;
  };
  const balance = () => readCreditBalance(db, creditUserId, new Date());
  const grant = (amount: number, label: string) => grantCredits(db, creditUserId, { type: "purchase", amount, key: `kredi-${tag}-${label}` });
  const chargesOf = async (jobId: string) => (await listCreditEntries(db, creditUserId, { types: ["charge"], limit: 200 })).filter((entry) => entry.panelJobId === jobId);
  const drain = (queue: string, deps: Partial<JobRunnerDeps>, enforced = true) =>
    runWorker({ mode: "drain", queue, store, deps: fakeDeps(deps), credits: createRealJobCredits(db, enforced), heartbeatMs: 60_000 });

  beforeAll(async () => {
    if (!env) return;
    const created = await db.from("workspaces").insert(workspaces.map((id, index) => ({ id, name: `Kredi işi testi ${index + 1}`, slug: `kredi-${tag}-${index + 1}` })));
    if (created.error) throw new Error(`test çalışma alanları kurulamadı: ${created.error.message}`);
    // Kredi onayını yazan kullanıcı çalışma alanının sahip üyesi olmalı (panel_jobs koruması).
    const members = await db.from("workspace_members").insert(workspaces.map((id) => ({ workspace_id: id, user_id: userId, role: "owner" })));
    if (members.error) throw new Error(`test üyelikleri kurulamadı: ${members.error.message}`);
    creditUserId = await createCreditTestUser(db, `is-${tag}`);
  }, 60_000);

  afterAll(async () => {
    if (!env) return;
    // Önce çalışma alanları (işleri cascade ile gider; ayırmaların iş bağı kopar), sonra test kullanıcısının hesabı ve kullanıcı.
    const removed = await db.from("workspaces").delete().in("id", workspaces);
    if (removed.error) throw new Error(`test çalışma alanları silinemedi: ${removed.error.message}`);
    await deleteCreditTestUser(db, creditUserId);
  }, 60_000);

  it("zorlama KAPALI: iş krediye bağlanmaz, işçi koşturur, deftere hiçbir şey yazılmaz", async () => {
    const queue = newQueue();
    const before = await balance();
    const job = await request(queue, workspaces[0], { kind: "analyze" }, false);
    expect(job.approval).toBeUndefined();
    expect(await readCreditHold(db, jobCreditKey(job.id))).toBeUndefined();
    expect(await drain(queue, { analyze: async () => analyzeSummary({ selected: 3, ok: 3 }) }, false)).toMatchObject({ code: 0, jobs: 1 });
    const done = await read(queue, workspaces[0], job.id);
    expect(done.status).toBe("succeeded");
    expect(done.result?.credits).toBeUndefined();
    expect(await balance()).toEqual(before);
    expect(await chargesOf(job.id)).toEqual([]);
  });

  it("zorlama AÇIK: istek ayırır → işçi koşturur → yapılan birim kadar düşer, fark serbest kalır; düşüm satırı işi ve birimi taşır", async () => {
    const queue = newQueue();
    await grant(200, "flow");
    const before = await balance();
    const job = await request(queue, workspaces[0], { kind: "analyze", maxCredits: 50 });
    expect(job.approval).toMatchObject({ basis: "credits", maxCredits: 50, approvedBy: userId });
    expect(await readCreditHold(db, jobCreditKey(job.id))).toMatchObject({ status: "open", amount: 50, panelJobId: job.id, workspaceId: workspaces[0] });
    expect(await balance()).toMatchObject({ available: before.available - 50, held: before.held + 50 });

    let limit: number | undefined;
    const analyze: JobRunnerDeps["analyze"] = async (_ctx, args) => {
      limit = args.limit;
      return analyzeSummary({ selected: 5, ok: 2, insufficient: 1, failed: 2 });
    };
    expect(await drain(queue, { analyze })).toMatchObject({ code: 0, jobs: 1 });
    expect(limit, "50 krediye 5 video sığar").toBe(5);

    const done = await read(queue, workspaces[0], job.id);
    expect(done).toMatchObject({ status: "succeeded", result: { credits: { reserved: 50, due: 30, charged: 30, units: { video_review: 3 }, priceVersion: CREDIT_PRICE_VERSION } } });
    expect(await readCreditHold(db, jobCreditKey(job.id))).toMatchObject({ status: "settled", charged: 30 });
    expect(await balance()).toMatchObject({ available: before.available - 30, held: before.held });
    const charges = await chargesOf(job.id);
    expect(charges.reduce((total, entry) => total + entry.amount, 0)).toBe(-30);
    for (const charge of charges) expect(charge).toMatchObject({ workspaceId: workspaces[0], units: { video_review: 3 }, priceVersion: CREDIT_PRICE_VERSION });
  });

  it("yarış: iki eşzamanlı istek + iki eşzamanlı claim; kredi yalnız birine yeter → TEK iş yazılır, alınan her işin ayırması AÇIKTIR", async () => {
    const queue = newQueue();
    const start = await balance();
    // Kullanılabilir krediyi tam 60'a getir (bir plan işi): fazlasını geçici ayırmayla tut.
    await grant(60, "race");
    const squeeze = start.available > 0 ? await repoFor(queue, true).reserveCredits(workspaces[0], { amount: start.available, key: `kredi-${tag}-squeeze` }) : undefined;
    try {
      expect((await balance()).available).toBe(60);
      const [first, second, claimA, claimB] = await Promise.allSettled([
        request(queue, workspaces[0], { kind: "plan" }),
        request(queue, workspaces[1], { kind: "plan" }),
        store.claim(queue, newWorkerId()),
        store.claim(queue, newWorkerId()),
      ]);
      const requests = [first, second];
      const created = requests.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      const refused = requests.flatMap((result) => (result.status === "rejected" ? [(result.reason as { code?: string }).code] : []));
      expect(created, "kredi tek işe yeter").toHaveLength(1);
      expect(refused).toEqual(["insufficient_credits"]);
      const rows = await db.from("panel_jobs").select("id, status").eq("queue", queue);
      expect(rows.data?.map((row) => row.id), "reddedilen istek satır bırakmadı").toEqual([created[0].id]);

      // Pencere yok: işçi işi istekle aynı anda da alsa, aldığı işin ayırması commit edilmiş ve açıktır.
      const claimed = [claimA, claimB].flatMap((result) => (result.status === "fulfilled" && result.value !== undefined ? [result.value] : []));
      expect(claimed.length, "kuyrukta tek işçi").toBeLessThanOrEqual(1);
      for (const job of claimed) expect(await readCreditHold(db, jobCreditKey(job.id)), "alınan işin ayırması açık").toMatchObject({ status: "open", amount: 60 });
      expect(await readCreditHold(db, jobCreditKey(created[0].id))).toMatchObject({ status: "open", amount: 60 });
      expect((await balance()).available).toBe(0);

      // Temizlik: iş alındıysa nabzı bayatlatılıp kapatılır (işçi kaybı), alınmadıysa iptal edilir; iki durumda da ayırma bırakılır.
      if (claimed.length === 1) {
        const stale = new Date(Date.now() - JOB_STALE_AFTER_MS - 60_000).toISOString();
        expect((await store.patch({ id: claimed[0].id, workerId: claimed[0].workerId ?? "" }, { heartbeat_at: stale })).applied).toBe(true);
      }
      const closed = await repoFor(queue, true).cancelJob(created[0].workspaceId, created[0].id);
      expect(closed.status).toBe(claimed.length === 1 ? "failed" : "cancelled");
      expect((await readCreditHold(db, jobCreditKey(created[0].id)))?.status).toBe("released");
    } finally {
      if (squeeze !== undefined) await repoFor(queue, true).releaseCredits(workspaces[0], squeeze.key);
    }
  });

  it("işçi kaybı: yetim iş kapatılırken ayırması da bırakılır (kredi düşülmez); yeni istek aynı krediyi ayırabilir", async () => {
    const queue = newQueue();
    await grant(10, "lost");
    const before = await balance();
    const orphan = await request(queue, workspaces[0], { kind: "briefing" });
    const dead = newWorkerId();
    expect((await store.claim(queue, dead))?.id).toBe(orphan.id);
    expect((await balance()).held).toBe(before.held + 4);

    const stale = new Date(Date.now() - JOB_STALE_AFTER_MS - 60_000).toISOString();
    expect((await store.patch({ id: orphan.id, workerId: dead }, { heartbeat_at: stale })).applied).toBe(true);
    // Yeni istek çalışma alanının yetim işini kapatır (ayırmasıyla birlikte) ve kendi ayırmasını açar.
    const next = await request(queue, workspaces[0], { kind: "briefing" });
    expect(await read(queue, workspaces[0], orphan.id)).toMatchObject({ status: "failed", result: { outcome: "worker_lost" } });
    expect((await readCreditHold(db, jobCreditKey(orphan.id)))?.status).toBe("released");
    expect(await chargesOf(orphan.id)).toEqual([]);
    expect((await balance()).held, "yalnız yeni işin ayırması açık").toBe(before.held + 4);

    await repoFor(queue, true).cancelJob(workspaces[0], next.id);
    expect(await balance()).toEqual(before);
  });

  it("süpürme: işi bitmiş ama ayırması açık kalmış kayıt işçi başında kapanır (yazılı borç düşülür); başka kuyruğa dokunulmaz", async () => {
    const queue = newQueue();
    const other = newQueue();
    await grant(20, "sweep");
    const before = await balance();
    const job = await request(queue, workspaces[0], { kind: "briefing" });
    const foreign = await request(other, workspaces[1], { kind: "briefing" });
    const [worker, otherWorker] = [newWorkerId(), newWorkerId()];
    expect((await store.claim(queue, worker))?.id).toBe(job.id);
    expect((await store.claim(other, otherWorker))?.id).toBe(foreign.id);
    // İşçi işi kapattı ama kesinleştirmeyi yazamadan öldü: borç işin sonucunda yazılı, ayırma açık.
    const closing = { status: "succeeded" as const, finished_at: new Date().toISOString(), result: { exitCode: 0, credits: { reserved: 4, due: 4, units: { briefing: 1 }, priceVersion: CREDIT_PRICE_VERSION } } };
    expect((await store.patch({ id: job.id, workerId: worker }, closing)).applied).toBe(true);
    expect((await store.patch({ id: foreign.id, workerId: otherWorker }, closing)).applied).toBe(true);
    expect((await balance()).held).toBe(before.held + 8);

    expect(await drain(queue, {})).toMatchObject({ code: 0, jobs: 0 });
    expect(await readCreditHold(db, jobCreditKey(job.id))).toMatchObject({ status: "settled", charged: 4, units: { briefing: 1 } });
    expect((await readCreditHold(db, jobCreditKey(foreign.id)))?.status, "başka kuyruğun ayırması açık kaldı").toBe("open");
    expect(await drain(other, {})).toMatchObject({ code: 0, jobs: 0 });
    expect((await readCreditHold(db, jobCreditKey(foreign.id)))?.status).toBe("settled");
    expect(await balance()).toMatchObject({ available: before.available - 8, held: before.held });
  });

  it("zorlama AÇIK işçi, kredi ayrılmamış (zorlama açılmadan istenmiş) işi koşturmaz: blocked + insufficient_credits", async () => {
    const queue = newQueue();
    const job = await request(queue, workspaces[0], { kind: "plan" }, false);
    const deps = fakeDeps();
    const result = await runWorker({ mode: "drain", queue, store, deps, credits: createRealJobCredits(db, true), heartbeatMs: 60_000 });
    expect(result).toMatchObject({ code: 0, jobs: 1 });
    expect(deps.plan).not.toHaveBeenCalled();
    expect(await read(queue, workspaces[0], job.id)).toMatchObject({ status: "blocked", result: { outcome: "insufficient_credits" } });
  });
});
