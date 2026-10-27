/**
 * Durum ucu (`GET /api/isler`): yan etkisiz okuma, çalışma alanı bağlamdan, müşteri görünümünde para / sağlayıcı / günlük yok,
 * "işçi gerekli" bilgisi. Depo sahtedir ve YALNIZ iki okuma metodunu taşır: uç başka bir şeye dokunursa test düşer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const { getPanelContext } = vi.hoisted(() => ({ getPanelContext: vi.fn() }));
vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/data")>()), getPanelContext }));

import { GET } from "@/app/api/isler/route";
import type { PanelJob } from "@/lib/domain/panel-job";
import type { JobsStatusResponse } from "@/lib/domain/panel-job-view";
import { handleJobsStatusRequest, readJobsStatus, requestedJobId, type JobsStatusContext, type JobsStatusDeps } from "@/lib/job-control/status-view";
import { jobsStatusUrl } from "@/lib/routes";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();
const url = (jobId?: string) => `http://localhost:3103${jobsStatusUrl(jobId)}`;

/** Yöneticiye özel her alanı dolu, çalışan bir toplama işi. */
const RUNNING: PanelJob = {
  id: "job-run",
  workspaceId: "ws-a",
  queue: "test-k",
  kind: "collect",
  dryRun: false,
  params: { limit: 12 },
  status: "running",
  approval: { basis: "one_time", maxUsd: 0.37, approvedBy: "kullanici-7", approvedAt: ago(60) },
  steps: [{ id: "collect", status: "running", note: "Apify koşusu başladı: instagram-scraper", spend: { estimateUsd: 0.31 } }],
  currentStep: "collect",
  progress: { done: 2, total: 5 },
  logTail: "gunluk-satiri: rakip metni",
  result: { estimate: { usd: 0.31, lines: [{ label: "tahmin-satiri", usd: 0.31 }] }, spend: { reservedUsd: 0.33 } },
  error: "teknik-hata-metni",
  workerId: "isci-pid-4242",
  heartbeatAt: ago(5),
  requestedBy: "kullanici-7",
  createdAt: ago(120),
  startedAt: ago(110),
};
const QUEUED: PanelJob = { id: "job-q", workspaceId: "ws-a", queue: "test-k", kind: "plan", dryRun: false, params: {}, status: "queued", steps: [], createdAt: ago(40) };
const DONE: PanelJob = { ...RUNNING, id: "job-done", status: "succeeded", finishedAt: ago(1), result: { ...RUNNING.result, outcome: "nothing_to_do" } };

/** Müşteri görünümüne sızmaması gereken her şey. */
const OPERATOR_ONLY = ["Apify", "instagram-scraper", "0.37", "0.31", "0.33", "gunluk-satiri", "tahmin-satiri", "teknik-hata-metni", "isci-pid-4242", "kullanici-7", "approval", "logTail", "operator", "test-k"];

function context(active: PanelJob[], byId: Record<string, PanelJob> = {}) {
  const repo = {
    listJobs: vi.fn<JobsStatusContext["repo"]["listJobs"]>(async () => active),
    getJob: vi.fn<JobsStatusContext["repo"]["getJob"]>(async (_wsId, jobId) => byId[jobId] ?? null),
  };
  return { repo, wsId: "ws-a", now: NOW };
}

const deps = (ctx: JobsStatusContext, overrides: Partial<JobsStatusDeps> = {}): JobsStatusDeps => ({
  getContext: async () => ctx,
  operator: () => true,
  canKick: () => true,
  ...overrides,
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("requestedJobId", () => {
  it("?id= değerini okur; yoksa, boşsa ya da çok uzunsa undefined", () => {
    expect(requestedJobId(url("job-1"))).toBe("job-1");
    expect(requestedJobId(url())).toBeUndefined();
    expect(requestedJobId(`${url()}?id=`)).toBeUndefined();
    expect(requestedJobId(`${url()}?id=${"x".repeat(101)}`)).toBeUndefined();
  });
});

describe("readJobsStatus", () => {
  it("etkin iş yoksa yalnız workerNeeded: false döner", async () => {
    expect(await readJobsStatus(context([]), { operator: true, canKick: true })).toEqual({ workerNeeded: false });
  });

  it("yalnız etkin işi ve istenen işi okur; çalışma alanı bağlamdan gelir", async () => {
    const ctx = context([RUNNING], { "job-done": DONE });
    const body = await readJobsStatus(ctx, { operator: false, canKick: false, jobId: "job-done" });
    expect(ctx.repo.listJobs).toHaveBeenCalledExactlyOnceWith("ws-a", { active: true, limit: 1 });
    expect(ctx.repo.getJob).toHaveBeenCalledExactlyOnceWith("ws-a", "job-done");
    expect(body.active).toMatchObject({ id: "job-run", kind: "collect", status: "running", stale: false, currentStep: "collect", progress: { done: 2, total: 5 } });
    expect(body.job).toMatchObject({ id: "job-done", status: "succeeded", outcome: "nothing_to_do" });
  });

  it("MÜŞTERİ görünümünde tutar, sağlayıcı, günlük, ham not, hata, onaylayan, işçi yok", async () => {
    const body = await readJobsStatus(context([RUNNING], { "job-done": DONE }), { operator: false, canKick: true, jobId: "job-done" });
    const text = JSON.stringify(body);
    for (const secret of OPERATOR_ONLY) expect(text, secret).not.toContain(secret);
    expect(body.active?.steps).toEqual([{ id: "collect", status: "running" }]);
    expect(body.workerNeeded).toBe(false);
  });

  it("YÖNETİCİ görünümünde işin tamamı `operator` alanında gelir", async () => {
    const body = await readJobsStatus(context([RUNNING]), { operator: true, canKick: true });
    expect(body.active?.operator).toEqual(RUNNING);
  });

  it("bulunamayan istenen iş yanıtta yoktur (hata değil)", async () => {
    const body = await readJobsStatus(context([]), { operator: true, canKick: true, jobId: "baska-calisma-alaninin-isi" });
    expect(body).toEqual({ workerNeeded: false });
  });

  it("workerNeeded: sırada bekleyen iş + yönetici + dürtme işe yarar ise true", async () => {
    const waiting = context([QUEUED]);
    expect((await readJobsStatus(waiting, { operator: true, canKick: true })).workerNeeded).toBe(true);
    expect((await readJobsStatus(waiting, { operator: true, canKick: false })).workerNeeded).toBe(false); // işler kapalı ya da işçi yaşıyor
    expect((await readJobsStatus(waiting, { operator: false, canKick: true })).workerNeeded).toBe(false); // müşteri dürtemez
    const fresh = context([{ ...QUEUED, createdAt: ago(3) }]);
    expect((await readJobsStatus(fresh, { operator: true, canKick: true })).workerNeeded).toBe(false); // işçi henüz almış olabilir
    expect((await readJobsStatus(context([RUNNING]), { operator: true, canKick: true })).workerNeeded).toBe(false);
  });
});

describe("handleJobsStatusRequest", () => {
  it("200 + önbelleksiz JSON; sorgudaki çalışma alanı kimliği ETKİSİZ (yalnız bağlamdaki kullanılır)", async () => {
    const ctx = context([RUNNING], { "job-done": DONE });
    const response = await handleJobsStatusRequest(new Request(`${url("job-done")}&workspaceId=ws-baska&wsId=ws-baska`), deps(ctx));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as JobsStatusResponse;
    expect(body.active?.id).toBe("job-run");
    expect(body.job?.id).toBe("job-done");
    expect(ctx.repo.listJobs).toHaveBeenCalledWith("ws-a", expect.anything());
    expect(ctx.repo.getJob).toHaveBeenCalledWith("ws-a", "job-done");
  });

  it("yönetici modu kapalıyken dürtme denetimi hiç sorulmaz ve yanıtta yönetici alanı yoktur", async () => {
    const canKick = vi.fn(() => true);
    const response = await handleJobsStatusRequest(new Request(url()), deps(context([QUEUED]), { operator: () => false, canKick }));
    const body = (await response.json()) as JobsStatusResponse;
    expect(body).toEqual({ active: expect.not.objectContaining({ operator: expect.anything() }), workerNeeded: false });
    expect(canKick).not.toHaveBeenCalled();
  });

  it("okuma hatasında 500 + kısa Türkçe mesaj; ayrıntı sızmaz", async () => {
    const log = vi.fn();
    const failing: JobsStatusDeps = { ...deps(context([])), getContext: async () => Promise.reject(new Error("db parolası: hunter2")), log };
    const response = await handleJobsStatusRequest(new Request(url()), failing);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("hunter2");
    expect(JSON.parse(text)).toEqual({ message: "İş durumu şu an okunamıyor." });
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("GET /api/isler (route)", () => {
  it("panel bağlamından okur; yönetici modunda `operator` dolu, kapalıyken yok", async () => {
    getPanelContext.mockResolvedValue(context([RUNNING]));
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("OPERATOR_MODE", "local");
    const asOperator = (await (await GET(new Request(url()))).json()) as JobsStatusResponse;
    expect(asOperator.active?.operator?.approval?.maxUsd).toBe(0.37);

    vi.stubEnv("OPERATOR_MODE", "off");
    const response = await GET(new Request(url()));
    const text = await response.text();
    for (const secret of OPERATOR_ONLY) expect(text, secret).not.toContain(secret);
    expect((JSON.parse(text) as JobsStatusResponse).active?.status).toBe("running");
  });

  it("örnek veride (işler kapalı) sırada iş görünse de workerNeeded false", async () => {
    getPanelContext.mockResolvedValue(context([QUEUED]));
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("OPERATOR_MODE", "local");
    vi.stubEnv("DATA_SOURCE", "mock");
    expect(((await (await GET(new Request(url()))).json()) as JobsStatusResponse).workerNeeded).toBe(false);
    vi.stubEnv("DATA_SOURCE", "supabase");
    expect(((await (await GET(new Request(url()))).json()) as JobsStatusResponse).workerNeeded).toBe(true);
  });
});
