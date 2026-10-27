/**
 * ÖNİZLEME GÜVENLİĞİ · GERÇEK bağlama (`createRealDeps`) + gerçek veritabanı (yerel Supabase).
 *
 * Soru: "Önce bak" (kuru koşu) işi gerçek bir çalışma alanında güvenle tıklanabilir mi? Kanıt üç katmanlıdır (`preview-guard.ts`):
 *  1. G/Ç SINIRI: işçi koşarken yapılan HER ağ çağrısı kaydedilir. İzinli olan: Supabase'den okuma, işçinin KENDİ iş satırı (bu testin
 *     kuyruğunda `claim_panel_job` + `panel_jobs` çitli yazımı) ve aktör fiyatı okuma (ücretsiz; testte sahte yanıt, ağa çıkılmaz).
 *     Başka her çağrı (tabloya yazma, başka RPC, toplama koşusu, video indirme) reddedilir ve testi düşürür.
 *  2. ALT SÜREÇ: `node:child_process` taklittir; yazı / video aracı başlatılmaya çalışılırsa kaydedilir ve fırlatır.
 *  3. VERİ: çalışma alanına bağlı HER tabloda satır sayısı önce / sonra aynıdır (`panel_jobs` dışında): boş çalışma alanında VE içerik,
 *     analiz, fikir, plan, koşu taşıyan dolu çalışma alanında (plan üretimi "dokunulmamış fikirleri siler": önizleme silmemeli).
 * Test KENDİ çalışma alanlarını kurar ve siler; kuyruğu koşuya özgüdür (canlı işçi yalnız `panel`'i alır). GERÇEK KOŞU (kuru koşu
 * olmayan iş) BU TESTTE YOKTUR. Sağlayıcı anahtarı sahte değerle değiştirilir. Yerel Supabase kapalıysa ATLANIR.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { JobStatusStore, type JobStatusStoreDeps } from "@/components/jobs/job-status-store";
import { createSupabaseRepository } from "@/lib/data/supabase/supabase-repository";
import { deleteContractWorkspace, seedContractWorkspace } from "@/lib/data/supabase/testing/contract-seed";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import { estimateJobCredits } from "@/lib/domain/credit-pricing";
import { JOB_KIND_SPEC, JOB_KINDS, type JobKind, type PanelJob } from "@/lib/domain/panel-job";
import type { JobsStatusResponse } from "@/lib/domain/panel-job-view";
import { DEFAULT_ANALYZE_LIMIT } from "@/lib/intel/analysis-select";
import { handleJobsStatusRequest } from "@/lib/job-control/status-view";
import { createJobStore } from "@/lib/job-runner/job-store";
import { createPreviewGuard, PREVIEW_UNIT_PRICE_USD, type PreviewGuard } from "@/lib/job-runner/preview-guard";
import { createRealDeps } from "@/lib/job-runner/real-deps";
import { runWorker } from "@/lib/job-runner/worker";
import { runSubprocess } from "@/lib/llm/subprocess";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { workspaceDocDir } from "@/lib/workspace/doc-dir";
import { createSupabaseWorkspace } from "@/lib/workspace/registry-db";

const spawned = vi.hoisted(() => [] as string[]);
// Fabrika, süreç başlatan modül ilk yüklendiğinde koşar: yardımcı burada (dinamik) içe aktarılır, üstteki içe aktarma sırasına bağlı kalmaz.
vi.mock("node:child_process", async (importOriginal) => {
  const { forbiddenChildProcess } = await import("@/lib/job-runner/preview-guard");
  return forbiddenChildProcess(await importOriginal<typeof import("node:child_process")>(), spawned);
});

const status = await resolveDbTestEnv();
const name = status.env ? "önizleme güvenliği (gerçek bağlama)" : `önizleme güvenliği (ATLANDI: ${status.skipReason})`;

/** Önizlemesi olan türler (tür tablosundan): hepsi sınanır. */
const PREVIEW_KINDS = JOB_KINDS.filter((kind) => JOB_KIND_SPEC[kind].preview);
/** Satır sayısı değişmemesi gereken çekirdek tablolar (liste DB'den keşfedilir; bunlar keşfin boş dönmediğinin kanıtıdır). */
const CORE_TABLES = ["collection_runs", "content_items", "metric_snapshots", "transcripts", "content_analyses", "content_creative_labels", "content_topic_clusters", "weekly_plans", "weekly_plan_items", "ideas", "idea_evidence", "agent_briefings", "notifications"];

describe.skipIf(!status.env)(`${name} · DB`, { timeout: 240_000 }, () => {
  const env = status.env;
  const userId = env?.userId ?? randomUUID();
  const url = env?.url ?? "http://127.0.0.1";
  const db: AdminClient = createClient<Database>(url, env?.serviceRoleKey ?? "atlandi", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const tag = randomUUID().slice(0, 8);
  const queue = `onizleme_${tag}`;
  const repo = createSupabaseRepository({ db, approverUserId: userId, jobQueue: queue });
  const created: string[] = [];
  const full = { id: randomUUID(), slug: "" };
  let empty = { id: "", slug: "" };
  let guard: PreviewGuard;
  let tables: string[] = [];

  /** Çalışma alanına bağlı her tablodaki satır sayısı (`panel_jobs` hariç). Korumanın dışından, gerçek ağ çağrısıyla sayılır. */
  const snapshot = async (wsId: string): Promise<Record<string, number>> =>
    Object.fromEntries(
      await Promise.all(
        tables.map(async (table) => {
          const response = await guard.realFetch(`${url}/rest/v1/${table}?workspace_id=eq.${wsId}&select=workspace_id`, {
            method: "HEAD",
            headers: { apikey: env?.serviceRoleKey ?? "", authorization: `Bearer ${env?.serviceRoleKey ?? ""}`, prefer: "count=exact" },
          });
          const total = Number(response.headers.get("content-range")?.split("/")[1]);
          if (!response.ok || !Number.isFinite(total)) throw new Error(`${table} sayılamadı (${response.status})`);
          return [table, total] as const;
        }),
      ),
    );

  /** Bir önizleme işi ister, GERÇEK bağlamayla işçiyi bu testin kuyruğunda koşturur, biten işi döndürür. */
  const preview = async (wsId: string, kind: JobKind): Promise<PanelJob> => {
    const job = await repo.requestJob(wsId, { kind, dryRun: true } as Parameters<typeof repo.requestJob>[1]);
    const result = await guard.watch({ queue, jobId: job.id }, () => runWorker({ mode: "drain", queue, store: createJobStore(db), deps: createRealDeps(), heartbeatMs: 60_000 }));
    expect(result, `${kind} önizlemesi: işçi tek işi koşturup çıktı`).toEqual({ code: 0, jobs: 1, reason: "drained" });
    const done = await repo.getJob(wsId, job.id);
    if (done === null) throw new Error("iş okunamadı");
    return done;
  };

  /** Çalışma alanında üç önizlemeyi sırayla koşturur; satır sayıları değişmemeli. */
  const previewAll = async (wsId: string): Promise<Record<string, PanelJob>> => {
    const before = await snapshot(wsId);
    const jobs: Record<string, PanelJob> = {};
    for (const kind of PREVIEW_KINDS) jobs[kind] = await preview(wsId, kind);
    expect(await snapshot(wsId), "çalışma alanına bağlı hiçbir tabloda satır sayısı değişmedi").toEqual(before);
    return jobs;
  };

  beforeAll(async () => {
    if (!env) return;
    vi.stubEnv("APIFY_TOKEN", "onizleme-testi-sahte-anahtar");
    guard = createPreviewGuard({ supabaseUrl: url, realFetch: globalThis.fetch });
    vi.stubGlobal("fetch", guard.fetch);

    const openApi = (await (await guard.realFetch(`${url}/rest/v1/`, { headers: { apikey: env.serviceRoleKey, authorization: `Bearer ${env.serviceRoleKey}` } })).json()) as {
      definitions?: Record<string, { properties?: Record<string, unknown> }>;
    };
    tables = Object.entries(openApi.definitions ?? {}).flatMap(([table, definition]) => (definition.properties?.workspace_id !== undefined && table !== "panel_jobs" ? [table] : []));

    const workspace = await createSupabaseWorkspace({ name: `Önizleme boş ${tag}`, handle: `onizleme.bos.${tag}` }, { db, userId });
    empty = { id: workspace.id, slug: workspace.slug ?? "" };
    created.push(empty.id, full.id);
    await seedContractWorkspace(db, full.id, userId, new Date());
    full.slug = `sozlesme-${full.id.slice(0, 8)}`;
  }, 200_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (!env) return;
    for (const id of created) await deleteContractWorkspace(db, id);
  }, 60_000);

  it("düzenek: sayılacak tablolar keşfedildi; koruma alt süreci, ücretli çağrıyı ve iki istemcinin yazımını gerçekten durduruyor", async () => {
    expect(tables).toEqual(expect.arrayContaining(CORE_TABLES));
    expect(PREVIEW_KINDS).toEqual(["routine", "collect", "measure"]);

    await expect(runSubprocess({ command: "claude", args: ["--version"], timeoutMs: 1000 })).rejects.toMatchObject({ code: "spawn_failed" });
    expect(spawned).toEqual(["spawn claude"]);
    spawned.length = 0;

    await expect(fetch("https://api.apify.com/v2/acts/sahip~aktor/runs", { method: "POST", body: "{}" })).rejects.toThrow(/yasak/);
    await expect(fetch("https://scontent.cdninstagram.com/v/video.mp4")).rejects.toThrow(/yasak/);
    // Depo istemcisi (`db`) ve uygulamanın kendi istemcisi (`getAdminClient`) AYNI korumanın arkasında: yazım ağa çıkmadan reddedilir.
    const blocked = await guard.watch({ queue, jobId: randomUUID() }, async () => [
      await db.from("ideas").delete().eq("workspace_id", randomUUID()),
      await getAdminClient().from("notifications").delete().eq("workspace_id", randomUUID()),
      await getAdminClient().rpc("claim_panel_job", { p_queue: "panel", p_worker_id: "worker-test" }),
    ]);
    expect(blocked.map((result) => result.error === null)).toEqual([false, false, false]);
    expect(guard.violations).toHaveLength(5);
    expect(guard.violations.join("\n")).toMatch(/claim_panel_job.*panel/);
    guard.reset();
  });

  it("BOŞ çalışma alanı: üç önizleme biter; hiçbir tabloya yazılmaz, tahmin yalnız fiyat okumasından gelir", async () => {
    const jobs = await previewAll(empty.id);

    expect(jobs.routine).toMatchObject({ status: "succeeded", dryRun: true, result: { exitCode: 0 } });
    expect(jobs.routine.steps.map((step) => step.id), "önkontrol / bakım adımı önizlemede yok").toEqual(["collect", "analyze", "label", "cluster", "plan", "measure_check", "briefing"]);
    expect(jobs.routine.steps.filter((step) => !["pending", "skipped", "needs_approval"].includes(step.status)), "hiçbir adım koşmadı").toEqual([]);
    expect(jobs.routine.steps.find((step) => step.id === "collect")?.status, "geçmiş toplama yok: toplama onay bekler").toBe("needs_approval");
    // Kredi tahmininin birim sayıları yazıldı (yalnız okuma): tek kendi hesap taranır, inceleme tavanı sayılır.
    expect(jobs.routine.result?.estimate?.units).toEqual({ accounts: 1, videos: DEFAULT_ANALYZE_LIMIT, measureRuns: 0 });
    expect(estimateJobCredits("routine", jobs.routine.result?.estimate?.units)?.maxCredits, "tur önizlemesinin kredi tahmini hesaplanabilir").toBeGreaterThan(0);

    // Kendi hesap: 1 profil + 10 içerik sonucu, sahte birim fiyatla.
    expect(jobs.collect).toMatchObject({ status: "succeeded", dryRun: true, steps: [{ id: "collect", status: "ok" }], result: { exitCode: 0 } });
    expect(jobs.collect.result?.estimate?.usd).toBeCloseTo(11 * PREVIEW_UNIT_PRICE_USD, 6);
    expect(jobs.collect.result?.estimate?.lines.map((line) => line.label)).toEqual(["profil (1 hesap)", `@onizleme.bos.${tag}`]);
    expect(jobs.collect.result?.spend, "önizlemede harcama kaydı yok").toBeUndefined();
    expect(jobs.collect.steps[0]?.note).toContain("Hiçbir koşu başlatılmadı");

    expect(jobs.measure).toMatchObject({ status: "succeeded", dryRun: true, steps: [{ id: "measure", status: "skipped", code: "no_reels" }], result: { outcome: "no_reels" } });
  });

  it("DOLU çalışma alanı (içerik, analiz, fikir, plan, koşu var): üç önizleme biter; hiçbir satır eklenmez / silinmez", async () => {
    const before = await snapshot(full.id);
    for (const table of ["content_items", "content_analyses", "ideas", "weekly_plans", "weekly_plan_items", "collection_runs", "transcripts"]) expect(before[table], `tohum: ${table} dolu`).toBeGreaterThan(0);

    const jobs = await previewAll(full.id);
    for (const kind of PREVIEW_KINDS) expect(jobs[kind], kind).toMatchObject({ status: "succeeded", dryRun: true });
    expect(jobs.routine.steps.filter((step) => !["pending", "skipped", "needs_approval"].includes(step.status)), "hiçbir adım koşmadı").toEqual([]);
    expect(jobs.routine.steps.some((step) => step.status === "pending"), "yapılacak iş bulundu ama yalnız listelendi").toBe(true);
    // 2 kendi hesap + 3 izlenen rakip: tek profil koşusu + hesap başına içerik koşusu.
    expect(jobs.collect.result?.estimate?.lines).toHaveLength(6);
    expect(jobs.collect.result?.estimate?.usd).toBeGreaterThan(0);
    expect(jobs.collect.result?.spend).toBeUndefined();
    expect(jobs.measure.result?.spend).toBeUndefined();
    // Ölçüm önizlemesi derin yoldan geçti (son günlerde kendi videosu var): tahmin + onay kuralı okundu, yine hiçbir şey yazılmadı.
    expect(jobs.measure.steps).toMatchObject([{ id: "measure", status: "ok" }]);
    expect(jobs.measure.result?.estimate?.lines).toHaveLength(3);
    // Tur önizlemesi yapılacak işleri buldu (inceleme, plan, sonuç kontrolü, notlar) ama hiçbirini koşturmadı.
    for (const step of ["analyze", "plan", "measure_check", "briefing"]) expect(jobs.routine.steps.find((s) => s.id === step)?.status, step).toBe("pending");
    // Birim sayıları kararla tutarlı: toplama atlanıyorsa (son toplama taze) hesap 0; koşabilecekse 2 kendi + 3 izlenen rakip = 5.
    const collectSkipped = jobs.routine.steps.find((s) => s.id === "collect")?.status === "skipped";
    expect(jobs.routine.result?.estimate?.units?.accounts).toBe(collectSkipped ? 0 : 5);
    expect(estimateJobCredits("routine", jobs.routine.result?.estimate?.units)?.maxCredits).toBeGreaterThan(0);
  });

  it("G/Ç sınırı: önizlemeler boyunca yalnız kendi iş satırı yazıldı; alt süreç ve ücretli çağrı yok; dosya yazılmadı", () => {
    expect(guard.violations, "izin dışı çağrı").toEqual([]);
    expect(spawned, "alt süreç (yazı / video aracı) başlatılmadı").toEqual([]);
    // Yazan çağrıların TAMAMI: iş alma + kendi iş satırının çitli yazımı. (Olumlu denetim: koruma işçinin trafiğini görüyor.)
    expect([...new Set(guard.calls.filter((call) => call.method !== "GET" && call.method !== "HEAD").map((call) => `${call.method} ${call.path}`))].sort()).toEqual(["PATCH /rest/v1/panel_jobs", "POST /rest/v1/rpc/claim_panel_job"]);
    const provider = guard.calls.filter((call) => call.origin === "https://api.apify.com");
    expect(provider.length, "fiyat okundu (toplama önizlemesi)").toBeGreaterThan(0);
    expect(provider.every((call) => call.method === "GET" && /^\/v2\/acts\/[^/]+$/.test(call.path)), "sağlayıcıya yalnız fiyat okuması").toBe(true);
    for (const workspace of [empty, full]) {
      for (const topic of ["rutin", "haftalik-plan"] as const) expect(existsSync(workspaceDocDir(process.cwd(), topic, workspace)), `${topic} çıktısı yazılmadı`).toBe(false);
    }
    expect(existsSync(path.join(process.cwd(), "docs", "rutin", full.id.slice(0, 8)))).toBe(false);
  });

  it("durum ucu → ekran deposu: biten tahmin işi `job` alanında döner; tahmin yalnız yönetici görünümünde okunur", async () => {
    const [finished] = await repo.listJobs(full.id, { status: "succeeded", limit: 50 }).then((jobs) => jobs.filter((job) => job.kind === "collect" && job.dryRun));
    if (finished === undefined) throw new Error("biten toplama önizlemesi yok (önceki test koşmadı)");

    /** Düğmenin yaptığı: durum ucunu `?id=` ile okur (gerçek işleyici + gerçek depo), yanıtı ortak depoya işler. */
    const readThroughStore = async (operator: boolean) => {
      const deps: JobStatusStoreDeps = {
        async fetchStatus(jobId) {
          const response = await handleJobsStatusRequest(new Request(`http://panel.test/api/isler${jobId === undefined ? "" : `?id=${jobId}`}`), {
            getContext: async () => ({ repo, wsId: full.id, now: new Date() }),
            operator: () => operator,
            canKick: () => true,
          });
          expect(response.status).toBe(200);
          return (await response.json()) as JobsStatusResponse;
        },
        setTimer: () => undefined,
        clearTimer: () => undefined,
        isVisible: () => true,
        onVisibilityChange: () => () => undefined,
      };
      const store = new JobStatusStore(deps);
      store.seed(full.id, { workerNeeded: false });
      store.follow(finished.id);
      await vi.waitFor(() => expect(store.getSnapshot().settled[finished.id]).toBeDefined());
      return store.getSnapshot();
    };

    const operator = await readThroughStore(true);
    expect(operator).toMatchObject({ workerNeeded: false, lastFinished: { id: finished.id, kind: "collect", dryRun: true, status: "succeeded" } });
    expect(operator.active).toBeUndefined();
    expect(operator.settled[finished.id]?.operator?.result?.estimate, "onay penceresinin okuduğu alan").toEqual(finished.result?.estimate);
    expect(operator.settled[finished.id]?.operator?.steps[0]?.spend?.estimateUsd).toBe(finished.result?.estimate?.usd);

    const customer = await readThroughStore(false);
    expect(customer.settled[finished.id]).toMatchObject({ id: finished.id, status: "succeeded", steps: [{ id: "collect", status: "ok" }] });
    expect(customer.settled[finished.id]).not.toHaveProperty("operator");
    expect(JSON.stringify(customer)).not.toMatch(/estimate|usd|logTail|note/i);
  });
});
