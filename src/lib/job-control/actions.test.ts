/**
 * İş action'ları (`app/actions/jobs.ts`): kapı, girdi doğrulaması, çalışma alanının bağlamdan gelmesi, depo çağrısı, işçi dürtme, yenileme.
 * Depo GERÇEK mock depodur (bellek içi; kendi test kuyruğu), işçi başlatıcı sahtedir (süreç doğmaz). Komut satırı / ortam sınaması
 * `actions-spawn.test.ts`'tedir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, getPanelContext, listWorkspaces, launchWorker, launchedWorkerAlive, workerLaunchProblem } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getPanelContext: vi.fn(),
  listWorkspaces: vi.fn(),
  launchWorker: vi.fn(),
  launchedWorkerAlive: vi.fn(() => false),
  workerLaunchProblem: vi.fn<() => string | undefined>(() => undefined),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/data")>()), getPanelContext }));
vi.mock("@/lib/workspace/registry", () => ({ listWorkspaces }));
vi.mock("@/lib/job-control/launch", () => ({ launchWorker, launchedWorkerAlive, workerLaunchProblem }));

import { cancelJobAction, kickWorkerAction, requestJobAction, requestRoutineForAllAction } from "@/app/actions/jobs";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { createMockRepository, type MockPanelRepository } from "@/lib/data/mock/mock-repository";
import { RepositoryError } from "@/lib/data/repository";
import { JOBS_GATE_MESSAGE, REQUEST_JOB_MESSAGES, WORKER_NOT_READY, WORKER_START_FAILED } from "@/lib/job-control/messages";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const NOW = new Date(MOCK_NOW);
const QUEUE = "test-k-actions";
let repo: MockPanelRepository;

/** Geçerli çalışma alanının etkin işleri. */
const activeJobs = () => repo.listJobs(WS, { active: true });

beforeEach(() => {
  vi.clearAllMocks();
  launchedWorkerAlive.mockReturnValue(false);
  workerLaunchProblem.mockReturnValue(undefined);
  launchWorker.mockReturnValue({ pid: 4242, logFile: "docs/isler/isci.log" });
  repo = createMockRepository(undefined, { jobQueue: QUEUE });
  getPanelContext.mockImplementation(async () => ({ repo, wsId: WS, now: new Date(NOW) }));
  listWorkspaces.mockResolvedValue([{ id: WS, name: "Örnek", accounts: [] }]);
  // Varsayılan: kapı açık (yerel yönetici modu + gerçek veri kaynağı; işçi betiği depo kökünde var).
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("OPERATOR_MODE", "local");
  vi.stubEnv("DATA_SOURCE", "supabase");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("kapı: yönetici modu + kullanılabilirlik (action doğrudan POST edilebilir)", () => {
  const calls = [
    () => requestJobAction({ kind: "analyze" }),
    () => requestRoutineForAllAction({}),
    () => cancelJobAction({ jobId: "job_01" }),
    () => kickWorkerAction(),
  ];

  it.each([
    ["yönetici modu kapalı", { OPERATOR_MODE: "off" }, JOBS_GATE_MESSAGE.operator_off],
    ["barındırılan ortam", { VERCEL: "1" }, JOBS_GATE_MESSAGE.hosted],
    ["örnek veri", { DATA_SOURCE: "mock" }, JOBS_GATE_MESSAGE.data_source],
  ])("%s → dört action da invalid_state; depoya ve işçiye dokunulmaz", async (_name, env, message) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    for (const call of calls) expect(await call()).toEqual({ ok: false, code: "invalid_state", message });
    expect(getPanelContext).not.toHaveBeenCalled();
    expect(listWorkspaces).not.toHaveBeenCalled();
    expect(launchWorker).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("kapı girdiden ÖNCE denetlenir: kapalıyken geçersiz girdi de invalid_state alır", async () => {
    vi.stubEnv("OPERATOR_MODE", "off");
    expect(await requestJobAction({ kind: "uydurma" })).toMatchObject({ ok: false, code: "invalid_state" });
  });
});

describe("requestJobAction", () => {
  it("işi geçerli çalışma alanına sıraya yazar, işçiyi dürter ve düzeni yeniler", async () => {
    const result = await requestJobAction({ kind: "plan", week: "2026-10-12" });
    const [job] = await activeJobs();
    expect(result).toEqual({ ok: true, jobId: job.id });
    expect(job).toMatchObject({ workspaceId: WS, queue: QUEUE, kind: "plan", status: "queued", params: { week: "2026-10-12" } });
    expect(launchWorker).toHaveBeenCalledExactlyOnceWith({ now: NOW }); // işçiye istekten hiçbir değer gitmez
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
  });

  it("geçersiz girdi depoya gitmeden invalid_input: bilinmeyen tür, fazla alan, 2 USD üstü, onaysız harcama, harcamayan işe onay", async () => {
    const requestJob = vi.spyOn(repo, "requestJob");
    const cases: [unknown, RegExp][] = [
      [{ kind: "uydurma" }, /Bilinmeyen iş türü/],
      [{ kind: "rm -rf" }, /Bilinmeyen iş türü/],
      [{}, /Bilinmeyen iş türü/],
      [null, /./],
      ["analyze", /./],
      [{ kind: "analyze", limit: 5 }, /geçersiz bir alan/],
      [{ kind: "analyze", args: ["--pilot"] }, /geçersiz bir alan/],
      [{ kind: "plan", week: "2026-10-12", queue: "panel" }, /geçersiz bir alan/],
      [{ kind: "collect", approval: { basis: "one_time", maxUsd: 2.01 } }, /en çok 2 USD/],
      [{ kind: "collect", approval: { basis: "one_time", maxUsd: 0 } }, /0'dan büyük/],
      [{ kind: "collect", approval: { basis: "one_time", maxUsd: "1" } }, /en çok 2 USD/],
      [{ kind: "collect" }, /tutar onayı olmadan/],
      [{ kind: "measure" }, /tutar onayı olmadan/],
      [{ kind: "collect", dryRun: true, approval: { basis: "one_time", maxUsd: 0.2 } }, /Önizleme para harcamaz/],
      [{ kind: "collect", approval: { basis: "monthly_cap" } }, /onay biçimi kullanılamaz/],
      [{ kind: "collect", limit: 51, approval: { basis: "one_time", maxUsd: 0.2 } }, /1 ile 50/],
      [{ kind: "plan", week: "2026-10-13" }, /Pazartesi/],
    ];
    for (const [input, message] of cases) {
      const result = await requestJobAction(input);
      expect(result, JSON.stringify(input)).toMatchObject({ ok: false, code: "invalid_input" });
      expect(result.ok === false && result.message, JSON.stringify(input)).toMatch(message);
    }
    expect(requestJob).not.toHaveBeenCalled();
    expect(launchWorker).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(await activeJobs()).toEqual([]);
  });

  it("gövdedeki çalışma alanı kimliği ETKİSİZ: reddedilir; geçerli istek yalnız bağlamdaki çalışma alanına yazılır", async () => {
    const requestJob = vi.spyOn(repo, "requestJob");
    for (const extra of [{ workspaceId: "ws-baska" }, { wsId: "ws-baska" }, { workspace_id: "ws-baska" }]) {
      expect(await requestJobAction({ kind: "analyze", ...extra })).toMatchObject({ ok: false, code: "invalid_input" });
    }
    expect(requestJob).not.toHaveBeenCalled();
    await requestJobAction({ kind: "analyze" });
    expect(requestJob).toHaveBeenCalledExactlyOnceWith(WS, { kind: "analyze" });
  });

  it("onaylı harcama: onay satıra yazılır (tutar ≤ 2 USD); onaylayan ve an girdiden gelmez", async () => {
    const result = await requestJobAction({ kind: "collect", limit: 10, approval: { basis: "one_time", maxUsd: 2 } });
    expect(result.ok).toBe(true);
    const [job] = await activeJobs();
    expect(job.approval).toMatchObject({ basis: "one_time", maxUsd: 2 });
    expect(job.params).toEqual({ limit: 10 });
  });

  it("onay çalışma alanının tavan durumunda kullanılamıyorsa nedenini söyler; satır yazılmaz, işçi dürtülmez", async () => {
    await repo.updateWorkspace(WS, { apifyMonthlyCapUsd: 0 });
    const closed = await requestJobAction({ kind: "collect", approval: { basis: "one_time", maxUsd: 0.2 } });
    expect(closed).toMatchObject({ ok: false, code: "invalid_input", message: expect.stringMatching(/harcama şu an kapalı/) });

    await repo.updateWorkspace(WS, { apifyMonthlyCapUsd: 10 });
    const unapproved = await requestJobAction({ kind: "measure", approval: { basis: "monthly_cap" } });
    expect(unapproved).toMatchObject({ ok: false, code: "invalid_input", message: expect.stringMatching(/Aylık tavan onaylı değil/) });

    expect(await activeJobs()).toEqual([]);
    expect(launchWorker).not.toHaveBeenCalled();
  });

  it("etkin iş varken ikinci istek already_exists (düz Türkçe mesaj); yeni işçi dürtülmez", async () => {
    await requestJobAction({ kind: "analyze" });
    vi.clearAllMocks();
    const second = await requestJobAction({ kind: "label" });
    expect(second).toMatchObject({ ok: false, code: "already_exists", message: expect.stringMatching(/zaten sırada ya da çalışan bir iş var/) });
    expect(launchWorker).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(await activeJobs()).toHaveLength(1);
  });

  it("işçinin dosyaları eksikse iş HİÇ yazılmaz (sırada sahipsiz iş kalmaz): invalid_state", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    workerLaunchProblem.mockReturnValue("env_file_missing");
    const expected = { ok: false, code: "invalid_state", message: WORKER_NOT_READY };
    expect(await requestJobAction({ kind: "analyze" })).toEqual(expected);
    expect(await requestRoutineForAllAction({})).toEqual(expected);
    expect(getPanelContext).not.toHaveBeenCalled();
    expect(launchWorker).not.toHaveBeenCalled();
    expect(await activeJobs()).toEqual([]);
    spy.mockRestore();
  });

  it("işçi başlatılamazsa iş sırada kalır ve sonuç yine başarılıdır (neden yalnız sunucu günlüğünde)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    launchWorker.mockImplementation(() => {
      throw new Error("tsx yok: C:\\gizli\\yol");
    });
    const result = await requestJobAction({ kind: "briefing" });
    expect(result).toMatchObject({ ok: true });
    expect(JSON.stringify(result)).not.toContain("gizli");
    expect(await activeJobs()).toHaveLength(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("beklenmeyen depo hatasında ayrıntı sızmaz", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(repo, "requestJob").mockRejectedValueOnce(new Error("db parolası: hunter2"));
    const result = await requestJobAction({ kind: "analyze" });
    expect(result).toMatchObject({ ok: false, code: "unknown" });
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(launchWorker).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("cancelJobAction", () => {
  it("sıradaki işi anında durdurur ve düzeni yeniler", async () => {
    const requested = await requestJobAction({ kind: "analyze" });
    if (!requested.ok) throw new Error("iş açılamadı");
    vi.clearAllMocks();
    expect(await cancelJobAction({ jobId: requested.jobId })).toEqual({ ok: true, jobId: requested.jobId, status: "cancelled" });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
    expect(await activeJobs()).toEqual([]);
  });

  it("çalışan işte durum running kalır (iş adım sınırında durur)", async () => {
    const requested = await requestJobAction({ kind: "analyze" });
    if (!requested.ok) throw new Error("iş açılamadı");
    repo.testing.claimJob();
    expect(await cancelJobAction({ jobId: requested.jobId })).toEqual({ ok: true, jobId: requested.jobId, status: "running" });
    expect((await repo.getJob(WS, requested.jobId))?.cancelRequestedAt).toBeDefined();
  });

  it("bitmiş iş invalid_state, olmayan iş not_found (düz Türkçe mesaj); düzen yenilenmez", async () => {
    expect(await cancelJobAction({ jobId: "job_01" })).toMatchObject({ ok: false, code: "invalid_state", message: expect.stringMatching(/zaten bitmiş/) });
    expect(await cancelJobAction({ jobId: "job_yok" })).toMatchObject({ ok: false, code: "not_found", message: expect.stringMatching(/İş bulunamadı/) });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("geçersiz girdi (eksik, boş, fazla alan, çalışma alanı kimliği) depoya gitmeden reddedilir", async () => {
    const cancelJob = vi.spyOn(repo, "cancelJob");
    for (const input of [null, {}, { jobId: "" }, { jobId: 5 }, { jobId: "x".repeat(101) }, { jobId: "job_01", workspaceId: "ws-baska" }]) {
      expect(await cancelJobAction(input), JSON.stringify(input)).toMatchObject({ ok: false, code: "invalid_input" });
    }
    expect(cancelJob).not.toHaveBeenCalled();
  });
});

describe("kickWorkerAction (idempotent dürtme)", () => {
  it("sırada iş yoksa işçi başlatmaz", async () => {
    expect(await kickWorkerAction()).toEqual({ ok: true, started: false });
    expect(launchWorker).not.toHaveBeenCalled();
  });

  it("sırada iş var ve işçi görünmüyorsa başlatır; veri değişmediği için düzen yenilenmez", async () => {
    await requestJobAction({ kind: "analyze" });
    vi.clearAllMocks();
    expect(await kickWorkerAction()).toEqual({ ok: true, started: true });
    expect(launchWorker).toHaveBeenCalledExactlyOnceWith({ now: NOW });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("bu panelin başlattığı işçi yaşıyorsa yeniden başlatmaz; iş satırı aynı kalır", async () => {
    await requestJobAction({ kind: "analyze" });
    const before = await activeJobs();
    vi.clearAllMocks();
    launchedWorkerAlive.mockReturnValue(true);
    for (let i = 0; i < 3; i += 1) expect(await kickWorkerAction()).toEqual({ ok: true, started: false });
    expect(launchWorker).not.toHaveBeenCalled();
    expect(await activeJobs()).toEqual(before);
  });

  it("iş çalışıyorsa (sırada değil) başlatmaz", async () => {
    await requestJobAction({ kind: "analyze" });
    repo.testing.claimJob();
    vi.clearAllMocks();
    expect(await kickWorkerAction()).toEqual({ ok: true, started: false });
    expect(launchWorker).not.toHaveBeenCalled();
  });

  it("işçi başlatılamazsa düz Türkçe hata döner; teknik neden sızmaz", async () => {
    await requestJobAction({ kind: "analyze" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    launchWorker.mockImplementation(() => {
      throw new Error("ENOENT C:\\gizli\\yol");
    });
    expect(await kickWorkerAction()).toEqual({ ok: false, code: "unknown", message: WORKER_START_FAILED });
    spy.mockRestore();
  });
});

describe("requestRoutineForAllAction (tüm hesaplar)", () => {
  /** Birden çok çalışma alanı: sahte depo (mock depo tek çalışma alanlıdır). */
  function manyWorkspaces(ids: string[], behave: (wsId: string) => void = () => {}) {
    const requestJob = vi.fn(async (wsId: string) => {
      behave(wsId);
      return { id: `job-${wsId}` };
    });
    getPanelContext.mockImplementation(async () => ({ repo: { requestJob, getWorkspace: async () => ({ apifyMonthlyCapUsd: 10 }) }, wsId: ids[0], now: new Date(NOW) }));
    listWorkspaces.mockResolvedValue(ids.map((id) => ({ id, name: id, accounts: [] })));
    return requestJob;
  }

  it("çalışma alanı listesi SUNUCUDAKİ kayıttan gelir; her birine bir haftalık tur, tek işçi", async () => {
    const requestJob = manyWorkspaces(["ws-a", "ws-b", "ws-c"]);
    expect(await requestRoutineForAllAction({ dryRun: true })).toEqual({ ok: true, requested: 3, skipped: 0, failed: 0, jobId: "job-ws-a" });
    expect(requestJob.mock.calls).toEqual([
      ["ws-a", { kind: "routine", dryRun: true }],
      ["ws-b", { kind: "routine", dryRun: true }],
      ["ws-c", { kind: "routine", dryRun: true }],
    ]);
    expect(launchWorker).toHaveBeenCalledExactlyOnceWith({ now: NOW });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
  });

  it("gövdeden çalışma alanı listesi / tür kabul edilmez", async () => {
    const requestJob = manyWorkspaces(["ws-a"]);
    for (const input of [{ workspaceIds: ["ws-x"] }, { kind: "collect" }, { approval: { basis: "one_time", maxUsd: 3 } }, { dryRun: true, approval: { basis: "one_time", maxUsd: 1 } }, null]) {
      expect(await requestRoutineForAllAction(input), JSON.stringify(input)).toMatchObject({ ok: false, code: "invalid_input" });
    }
    expect(requestJob).not.toHaveBeenCalled();
    expect(listWorkspaces).not.toHaveBeenCalled();
  });

  it("etkin işi olan hesap atlanır ve sayılır; geçerli hesapta açılamadıysa jobId yoktur", async () => {
    manyWorkspaces(["ws-a", "ws-b"], (wsId) => {
      if (wsId === "ws-a") throw new RepositoryError("already_exists", "etkin iş");
    });
    expect(await requestRoutineForAllAction({})).toEqual({ ok: true, requested: 1, skipped: 1, failed: 0 });
    expect(launchWorker).toHaveBeenCalledOnce();
  });

  it("hepsi atlandıysa işçi dürtülmez ve düzen yenilenmez", async () => {
    manyWorkspaces(["ws-a", "ws-b"], () => {
      throw new RepositoryError("already_exists", "etkin iş");
    });
    expect(await requestRoutineForAllAction({})).toEqual({ ok: true, requested: 0, skipped: 2, failed: 0 });
    expect(launchWorker).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("KISMİ başarı: sonuç başarılıdır ve sayıları taşır (açılan, atlanan, açılamayan + ilk neden); ayrıntı sızmaz, işçi başlar", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    manyWorkspaces(["ws-a", "ws-b", "ws-c", "ws-d"], (wsId) => {
      if (wsId === "ws-b") throw new RepositoryError("already_exists", "etkin iş");
      if (wsId === "ws-c") throw new Error("db parolası: hunter2");
    });
    const result = await requestRoutineForAllAction({});
    expect(result).toEqual({ ok: true, requested: 2, skipped: 1, failed: 1, failureReason: "Beklenmeyen bir hata oluştu. Lütfen tekrar dene.", jobId: "job-ws-a" });
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(launchWorker).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("gerçek mock depoda: bilinen hesapta açılır, kayıtta olup depoda olmayan hesap 'açılamadı' sayılır", async () => {
    listWorkspaces.mockResolvedValue([
      { id: WS, name: "Örnek", accounts: [] },
      { id: "ws_silinmis", name: "Silinmiş", accounts: [] },
    ]);
    const result = await requestRoutineForAllAction({ approval: { basis: "one_time", maxUsd: 0.5 } });
    expect(result).toMatchObject({ ok: true, requested: 1, skipped: 0, failed: 1, failureReason: REQUEST_JOB_MESSAGES.not_found });
    const [job] = await activeJobs();
    expect(job).toMatchObject({ kind: "routine", status: "queued", approval: { basis: "one_time", maxUsd: 0.5 } });
  });

  it("hiçbir hesapta açılamadıysa bunu söyler; işçi dürtülmez", async () => {
    manyWorkspaces(["ws-a"], () => {
      throw new RepositoryError("invalid_input", "kısıt");
    });
    const result = await requestRoutineForAllAction({});
    expect(result).toMatchObject({ ok: false, code: "invalid_input", message: expect.stringMatching(/^Hiçbir hesapta haftalık tur başlatılamadı\. 1 hesapta başlatılamadı: /) });
    expect(launchWorker).not.toHaveBeenCalled();
  });
});
