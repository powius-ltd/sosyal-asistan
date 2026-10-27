import { describe, expect, it } from "vitest";

import { parseRequestJobInput } from "@/lib/data/job-input";
import { clipTail, jobParamsSchema, jobProgressSchema, jobResultSchema, jobRowPatchSchema, jobStepSchema, jobStepsSchema, requestPanelJobArgs } from "@/lib/data/job-schema";
import { buildJobs } from "@/lib/data/mock/generators/jobs";
import { createClock } from "@/lib/data/mock/mock-clock";
import { toPanelJob, type JobRow } from "@/lib/data/supabase/mappers/job";
import { JOB_ERROR_MAX_CHARS, JOB_LOG_TAIL_MAX_CHARS, JOB_OUTCOME_CODES, JOB_STEP_IDS } from "@/lib/domain/panel-job";

describe("jsonb şemaları", () => {
  it("mock tohumundaki her iş yazma sözleşmesine uyar", () => {
    for (const job of buildJobs(createClock())) {
      expect(jobParamsSchema.safeParse(job.params).success, `${job.id} params`).toBe(true);
      expect(jobStepsSchema.safeParse(job.steps).success, `${job.id} steps`).toBe(true);
      if (job.progress !== undefined) expect(jobProgressSchema.safeParse(job.progress).success, `${job.id} progress`).toBe(true);
      if (job.result !== undefined) expect(jobResultSchema.safeParse(job.result).success, `${job.id} result`).toBe(true);
    }
  });

  it("adım: bilinmeyen alan / kimlik / durum / kod reddedilir; aynı adım iki kez yazılamaz", () => {
    expect(jobStepSchema.safeParse({ id: "analyze", status: "ok", seconds: 1.5, spend: {} }).success).toBe(true);
    for (const bad of [{ id: "deploy", status: "ok" }, { id: "analyze", status: "done" }, { id: "analyze", status: "ok", code: "boom" }, { id: "analyze", status: "ok", extra: 1 }, { id: "analyze", status: "ok", seconds: -1 }, { id: "analyze", status: "ok", spend: { estimateUsd: -0.1 } }]) {
      expect(jobStepSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(jobStepsSchema.safeParse([{ id: "analyze", status: "ok" }, { id: "analyze", status: "failed" }]).success).toBe(false);
    expect(jobStepsSchema.safeParse(JOB_STEP_IDS.map((id) => ({ id, status: "pending" }))).success).toBe(true);
  });

  it("sayaç: yapılan toplamı aşamaz; sonuç: yalnız `outcome` yazılmış satır (DB'nin worker_lost yazımı) geçerlidir", () => {
    expect(jobProgressSchema.safeParse({ done: 7, total: 19 }).success).toBe(true);
    for (const bad of [{ done: 20, total: 19 }, { done: -1, total: 3 }, { done: 1.5, total: 3 }, { done: 1 }]) expect(jobProgressSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    expect(jobResultSchema.parse({ outcome: "worker_lost" })).toEqual({ outcome: "worker_lost" });
    for (const code of JOB_OUTCOME_CODES) expect(jobResultSchema.safeParse({ outcome: code }).success, code).toBe(true);
    expect(jobResultSchema.safeParse({ estimate: { lines: [{ label: "İçerik koşuları" }] } }).success, "fiyatı okunamayan tahmin: usd yok (0 değil)").toBe(true);
    expect(jobResultSchema.safeParse({ estimate: { lines: [], units: { accounts: 5, measureRuns: 0 } } }).success, "birim sayıları isteğe bağlı").toBe(true);
    for (const bad of [{ estimate: { lines: [], units: { accounts: -1 } } }, { estimate: { lines: [], units: { accounts: 1.5 } } }, { estimate: { lines: [], units: { cost: 1 } } }]) {
      expect(jobResultSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    for (const bad of [{ outcome: "boom" }, { estimate: {} }, { estimate: { lines: [{ label: "" }] } }, { exitCode: 1.5 }, { cost: 3 }]) expect(jobResultSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it("işçi yaması: yalnız işçinin yazabildiği sütunlar; kimlik ve onay sütunları reddedilir; metin sınırları DB ile aynı", () => {
    const patch = { status: "running", steps: [{ id: "analyze", status: "running" }], current_step: "analyze", progress: { done: 1, total: 5 }, log_tail: "satır", heartbeat_at: "2026-10-05T12:00:00.000Z" };
    expect(jobRowPatchSchema.parse(patch)).toEqual(patch);
    expect(jobRowPatchSchema.safeParse({ status: "succeeded", finished_at: "2026-10-05T12:00:00Z", current_step: null, progress: null, result: { exitCode: 0 } }).success).toBe(true);
    for (const bad of [{ approved_max_usd: 2 }, { approval_basis: "one_time" }, { kind: "collect" }, { worker_id: "w2" }, { workspace_id: "x" }, { dry_run: false }, { params: {} }, { status: "paused" }, { heartbeat_at: "dün" }]) {
      expect(jobRowPatchSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(jobRowPatchSchema.safeParse({ log_tail: "x".repeat(JOB_LOG_TAIL_MAX_CHARS + 1) }).success).toBe(false);
    expect(jobRowPatchSchema.safeParse({ error: "x".repeat(JOB_ERROR_MAX_CHARS + 1) }).success).toBe(false);
  });

  it("clipTail: metnin SONUNU tutar, kod noktası sayar", () => {
    expect(clipTail("kısa")).toBe("kısa");
    expect(clipTail("abcdef", 3)).toBe("def");
    expect(Array.from(clipTail("😀".repeat(10), 4))).toHaveLength(4);
    expect(Array.from(clipTail("x".repeat(JOB_LOG_TAIL_MAX_CHARS + 50))).length).toBe(JOB_LOG_TAIL_MAX_CHARS);
  });

  it("requestPanelJobArgs: onaysız işte dayanak boş ve tutar NULL; kuyruk ve kullanıcı çağırandan", () => {
    expect(requestPanelJobArgs("ws", "test_q", parseRequestJobInput({ kind: "plan", week: "2026-10-05" }), "user")).toEqual({
      p_ws: "ws",
      p_queue: "test_q",
      p_kind: "plan",
      p_dry_run: false,
      p_params: { week: "2026-10-05" },
      p_approval_basis: "",
      p_approved_max_usd: null,
      p_user: "user",
    });
    expect(requestPanelJobArgs("ws", "panel", parseRequestJobInput({ kind: "collect", approval: { basis: "one_time", maxUsd: 0.25 } }), "user")).toMatchObject({ p_approval_basis: "one_time", p_approved_max_usd: 0.25, p_dry_run: false });
    expect(requestPanelJobArgs("ws", "panel", parseRequestJobInput({ kind: "measure", approval: { basis: "monthly_cap" } }), "user")).toMatchObject({ p_approval_basis: "monthly_cap", p_approved_max_usd: null });
  });

  it("requestPanelJobArgs: kredi parametreleri YALNIZ ayırma verilince gider (zorlama kapalıyken RPC'ye hiç gönderilmez)", () => {
    const plain = requestPanelJobArgs("ws", "panel", parseRequestJobInput({ kind: "analyze", maxCredits: 30 }), "user");
    expect(Object.keys(plain)).not.toContain("p_max_credits");
    expect(Object.keys(plain)).not.toContain("p_credit_owner");
    expect(requestPanelJobArgs("ws", "panel", parseRequestJobInput({ kind: "analyze" }), "user", { ownerUserId: "sahip", maxCredits: 190 })).toMatchObject({
      p_approval_basis: "",
      p_credit_owner: "sahip",
      p_max_credits: 190,
    });
  });

  it("jobResultSchema: kredi özeti (ayrılan / borç / düşülen / birimler) kabul edilir; bilinmeyen kalem reddedilir", () => {
    expect(jobResultSchema.safeParse({ credits: { reserved: 190, due: 30, charged: 30, units: { video_review: 3 }, priceVersion: "2026-10-12" } }).success).toBe(true);
    expect(jobResultSchema.safeParse({ credits: { reserved: 190, due: 0 } }).success).toBe(true);
    expect(jobResultSchema.safeParse({ credits: { reserved: 190, due: 30, units: { bilinmeyen: 1 } } }).success).toBe(false);
    expect(jobResultSchema.safeParse({ credits: { reserved: 190 } }).success).toBe(false);
  });
});

describe("toPanelJob (satır → domain)", () => {
  const row = (patch: Partial<JobRow> = {}): JobRow => ({
    id: "11111111-0000-4000-8000-000000000001",
    workspace_id: "22222222-0000-4000-8000-000000000001",
    queue: "panel",
    kind: "collect",
    dry_run: false,
    params: { limit: 10 },
    status: "blocked",
    approval_basis: "one_time",
    approved_max_usd: 0.1,
    approved_max_credits: null,
    approved_by: "33333333-0000-4000-8000-000000000001",
    approved_at: "2026-10-05T09:00:00+00:00",
    steps: [{ id: "collect", status: "needs_approval", code: "over_approved_amount", spend: { estimateUsd: 0.13 } }],
    current_step: null,
    progress: null,
    log_tail: null,
    result: { outcome: "over_approved_amount" },
    error: null,
    worker_id: "w1",
    heartbeat_at: "2026-10-05T09:00:10+00:00",
    cancel_requested_at: null,
    requested_by: "33333333-0000-4000-8000-000000000001",
    created_at: "2026-10-05T09:00:00+00:00",
    started_at: "2026-10-05T09:00:05+00:00",
    finished_at: "2026-10-05T09:00:10+00:00",
    ...patch,
  });

  it("alanları eşler; NULL → undefined (0 değil); zamanlar ISO UTC", () => {
    const job = toPanelJob(row());
    expect(job).toMatchObject({
      kind: "collect",
      status: "blocked",
      dryRun: false,
      params: { limit: 10 },
      approval: { basis: "one_time", maxUsd: 0.1, approvedAt: "2026-10-05T09:00:00.000Z" },
      result: { outcome: "over_approved_amount" },
      workerId: "w1",
      createdAt: "2026-10-05T09:00:00.000Z",
      finishedAt: "2026-10-05T09:00:10.000Z",
    });
    expect([job?.progress, job?.currentStep, job?.logTail, job?.error, job?.cancelRequestedAt]).toEqual([undefined, undefined, undefined, undefined, undefined]);
    const queued = toPanelJob(row({ status: "queued", approval_basis: null, approved_max_usd: null, approved_by: null, approved_at: null, worker_id: null, started_at: null, finished_at: null, heartbeat_at: null, kind: "analyze", steps: [], result: null }));
    expect(queued?.approval, "onaysız iş").toBeUndefined();
    expect(toPanelJob(row({ approval_basis: "monthly_cap", approved_max_usd: null }))?.approval).toEqual({ basis: "monthly_cap", approvedBy: "33333333-0000-4000-8000-000000000001", approvedAt: "2026-10-05T09:00:00.000Z" });
  });

  it("jsonb'si bozuk iş GİZLENMEZ: bozuk parça güvenli boşa düşer; bilinmeyen tür / durum eşlenmez", () => {
    const job = toPanelJob(row({ steps: [{ id: "collect", status: "ok" }, { id: "boom" }, "x"], progress: { done: 9, total: 1 }, result: { cost: 1 }, params: { limit: -5 }, current_step: "nope" }));
    expect(job?.steps).toEqual([{ id: "collect", status: "ok" }]);
    expect([job?.progress, job?.result, job?.currentStep]).toEqual([undefined, undefined, undefined]);
    expect(job?.params).toEqual({});
    expect(job?.status, "iş listede kalır").toBe("blocked");
    expect(toPanelJob(row({ kind: "deploy" }))).toBeUndefined();
    expect(toPanelJob(row({ status: "paused" }))).toBeUndefined();
  });

  it("toPanelJob: kredi tavanı onaya okunur (yalnız kredi dayanağı ve USD onayıyla birlikte)", () => {
    expect(toPanelJob(row({ approval_basis: "credits", approved_max_usd: null, approved_max_credits: 190 }))?.approval).toMatchObject({ basis: "credits", maxCredits: 190 });
    expect(toPanelJob(row({ approved_max_credits: 40 }))?.approval).toMatchObject({ basis: "one_time", maxUsd: 0.1, maxCredits: 40 });
    expect(toPanelJob(row({}))?.approval?.maxCredits, "tavan yoksa alan yok (0 değil)").toBeUndefined();
  });
});
