/**
 * Sözleşme parçası: panel işleri (`requestJob`, `listJobs`, `getJob`, `cancelJob`). ŞEKİL: iş alanları tutarlı (durum ↔ işçi / nabız /
 * bitiş, onay ↔ tür, adımlar türün adım sırasında, jsonb'ler yazma sözleşmesine uyar), yeniden eskiye, süzgeçler. DAVRANIŞ: istek →
 * sırada; çalışma alanı başına tek etkin iş (`already_exists`); geçersiz girdi ve ONAYSIZ HARCAMA `invalid_input` (satır bırakmaz);
 * iptal: sıradaki iş anında, çalışan işte yalnız istek (tekrar çağrı ilk isteği korur); bitmiş iş `invalid_state`.
 *
 * GÜVENLİK: süit yalnız $0 işler açar (kuru koşu, plan) ve ONAYLI HARCAMA İŞİ HİÇ OLUŞTURMAZ; işler `jobQueue` test kuyruğuna yazılır
 * (canlı işçi yalnız `panel` kuyruğunu alır). İşi almak / bitirmek işçinin işidir (depo üzerinden yapılamaz): `jobWorker` kancası.
 * Temizlik: her test açtığı işi durdurur ya da işçi rolüyle bitirir; geride etkin iş kalmaz.
 */
import { expect, it } from "vitest";

import { expectCode, MISSING_ID, ms, type ContractContext } from "@/lib/data/contract/support";
import { jobParamsSchema, jobProgressSchema, jobResultSchema, jobStepsSchema } from "@/lib/data/job-schema";
import { MAX_PAGE_LIMIT, type RequestJobInput } from "@/lib/data/queries";
import type { PanelRepository } from "@/lib/data/repository";
import { jobCreditCeiling } from "@/lib/domain/job-credits";
import {
  availableApprovalBases,
  isActiveJob,
  isUsdApprovalBasis,
  JOB_ERROR_MAX_CHARS,
  JOB_KIND_SPEC,
  JOB_KINDS,
  JOB_LOG_TAIL_MAX_CHARS,
  JOB_QUEUE_PATTERN,
  JOB_SPEND_MAX_USD,
  JOB_STATUSES,
  JOB_STEPS_BY_KIND,
  jobAllowsApproval,
  jobRequiresApproval,
  type JobStatus,
  type PanelJob,
} from "@/lib/domain/panel-job";
import { weekStartOf } from "@/lib/domain/weekly-plan";

/** $0, yazmayan iş: yanlışlıkla bir işçi alsa bile para / LLM harcamaz. */
const PREVIEW: RequestJobInput = { kind: "routine", dryRun: true };

function expectJobShape(job: PanelJob, wsId: string) {
  const label = `${job.id} (${job.kind}/${job.status})`;
  expect(job.workspaceId, label).toBe(wsId);
  expect(JOB_KINDS, label).toContain(job.kind);
  expect(JOB_STATUSES, label).toContain(job.status);
  expect(JOB_QUEUE_PATTERN.test(job.queue), `${label}: kuyruk adı`).toBe(true);
  expect(Date.parse(job.createdAt), label).not.toBeNaN();
  if (job.dryRun) expect(JOB_KIND_SPEC[job.kind].preview, `${label}: kuru koşu yalnız önizlemesi olan türde`).toBe(true);

  // jsonb alanları yazma sözleşmesine uyar (yazan işçi ve okuyan depo aynı şema).
  expect(jobParamsSchema.safeParse(job.params).success, `${label}: params`).toBe(true);
  expect(jobStepsSchema.safeParse(job.steps).success, `${label}: steps`).toBe(true);
  if (job.progress !== undefined) expect(jobProgressSchema.safeParse(job.progress).success, `${label}: progress`).toBe(true);
  if (job.result !== undefined) expect(jobResultSchema.safeParse(job.result).success, `${label}: result`).toBe(true);
  const order = JOB_STEPS_BY_KIND[job.kind];
  const positions = job.steps.map((step) => order.indexOf(step.id));
  expect(positions.every((position) => position >= 0), `${label}: adımlar türün adımları`).toBe(true);
  expect(positions, `${label}: adımlar koşu sırasıyla`).toEqual([...positions].sort((a, b) => a - b));
  if (job.currentStep !== undefined) expect(order, `${label}: currentStep`).toContain(job.currentStep);
  if (job.logTail !== undefined) expect(Array.from(job.logTail).length, `${label}: günlük sınırı`).toBeLessThanOrEqual(JOB_LOG_TAIL_MAX_CHARS);
  if (job.error !== undefined) expect(Array.from(job.error).length, `${label}: hata sınırı`).toBeLessThanOrEqual(JOB_ERROR_MAX_CHARS);

  // Durum ↔ alan tutarlılığı.
  if (job.status === "queued") {
    expect([job.workerId, job.startedAt, job.heartbeatAt, job.finishedAt, job.cancelRequestedAt], `${label}: sıradaki işe işçi dokunmamıştır`).toEqual([undefined, undefined, undefined, undefined, undefined]);
  } else if (job.status === "running") {
    expect(job.workerId?.trim(), `${label}: çalışan işin işçisi`).toBeTruthy();
    expect(ms(job.startedAt), `${label}: başlangıç`).toBeDefined();
    expect(ms(job.heartbeatAt), `${label}: nabız`).toBeDefined();
    expect(job.finishedAt, `${label}: çalışan iş bitmemiştir`).toBeUndefined();
  } else {
    expect(ms(job.finishedAt), `${label}: biten işin bitiş anı`).toBeDefined();
  }

  // ONAY: onaysız harcama satırı olamaz; onay yalnız harcayabilen türde ve gerçek koşuda; tek seferlik onay tutarlıdır.
  if (job.approval === undefined) {
    expect(jobRequiresApproval(job.kind, job.dryRun), `${label}: ONAYSIZ HARCAMA İŞİ`).toBe(false);
  } else {
    expect(job.dryRun, `${label}: kuru koşuya onay yazılmaz`).toBe(false);
    if (isUsdApprovalBasis(job.approval.basis)) {
      expect(jobAllowsApproval(job.kind, job.dryRun), `${label}: bu işe USD onayı yazılamaz`).toBe(true);
      expect(JOB_KIND_SPEC[job.kind].approvalBases, `${label}: dayanak`).toContain(job.approval.basis);
    } else {
      // Yalnız kredi onayı: USD yetkisi yok, tavan zorunlu; USD onayı isteyen tür (toplama / ölçüm) böyle açılamaz.
      expect(jobRequiresApproval(job.kind, job.dryRun), `${label}: KREDİ ONAYIYLA HARCAMA İŞİ`).toBe(false);
      expect([job.approval.maxUsd, job.approval.maxCredits !== undefined], `${label}: kredi dayanağı`).toEqual([undefined, true]);
    }
    if (job.approval.maxCredits !== undefined) {
      expect(Number.isInteger(job.approval.maxCredits) && job.approval.maxCredits > 0, `${label}: kredi tavanı`).toBe(true);
      expect(job.approval.maxCredits, `${label}: güvenli üst sınır`).toBeLessThanOrEqual(jobCreditCeiling(job.kind, { collects: true }));
    }
    expect(job.approval.approvedBy.trim(), `${label}: onaylayan`).toBeTruthy();
    expect(Date.parse(job.approval.approvedAt), `${label}: onay anı`).not.toBeNaN();
    if (job.approval.basis === "one_time") expect(job.approval.maxUsd, `${label}: tek seferlik onay tutar ister`).toBeDefined();
    if (job.approval.maxUsd !== undefined) {
      expect(job.approval.maxUsd, label).toBeGreaterThan(0);
      expect(job.approval.maxUsd, label).toBeLessThanOrEqual(JOB_SPEND_MAX_USD);
    }
  }
  expect(JSON.parse(JSON.stringify(job)), `${label}: serileştirilebilir`).toEqual(job);
}

export function jobsContract(ctx: ContractContext): void {
  const { wsId, foreign, create, jobQueue, jobWorker } = ctx;

  /** Testin açtığı işi geri alır: sıradaysa durdurur, çalışıyorsa işçi rolüyle bitirir. */
  async function settle(r: PanelRepository, jobId: string | undefined): Promise<void> {
    if (jobId === undefined) return;
    const job = await r.getJob(wsId, jobId);
    if (job === null || !isActiveJob(job)) return;
    if (job.status === "running") await jobWorker.finish(r, jobId);
    else await r.cancelJob(wsId, jobId);
  }
  const activeJobs = (r: PanelRepository) => r.listJobs(wsId, { active: true });

  it("listJobs: seed'de bitmiş işler (adımlı) var, etkin iş yok; alanlar tutarlı; yeniden eskiye; süzgeçler; bilinmeyen workspace → boş", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "jobs", () => r.listJobs(wsId));
    const jobs = await r.listJobs(wsId, { limit: MAX_PAGE_LIMIT });
    expect(jobs.length, "seed: en az bir bitmiş iş").toBeGreaterThan(0);
    expect(jobs.filter(isActiveJob), "seed'de etkin iş olmamalı (süit kendi işini açar)").toEqual([]);
    expect(jobs.some((job) => job.steps.length > 0), "seed: adımları yazılmış iş").toBe(true);
    for (const job of jobs) expectJobShape(job, wsId);
    const created = jobs.map((job) => Date.parse(job.createdAt));
    expect(created, "yeniden eskiye").toEqual([...created].sort((a, b) => b - a));
    expect(new Set(jobs.map((job) => job.id)).size, "kimlik tekil").toBe(jobs.length);

    expect((await r.listJobs(wsId, { limit: 1 })).map((job) => job.id)).toEqual([jobs[0].id]);
    const statuses: JobStatus[] = [jobs[0].status, "cancelled"];
    expect((await r.listJobs(wsId, { status: statuses })).every((job) => statuses.includes(job.status))).toBe(true);
    expect((await r.listJobs(wsId, { status: jobs[0].status })).some((job) => job.id === jobs[0].id)).toBe(true);
    expect((await r.listJobs(wsId, { active: false, limit: MAX_PAGE_LIMIT })).map((job) => job.id)).toEqual(jobs.map((job) => job.id));
    expect(await activeJobs(r)).toEqual([]);
    expect(await r.listJobs(foreign)).toEqual([]);
  });

  it("requestJob: sırada iş döner; getJob/listJobs görür; çalışma alanı başına TEK etkin iş; iptal anında; bitmiş iş iptal edilemez", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "jobs", () => r.listJobs(wsId));
    let jobId: string | undefined;
    try {
      const job = await r.requestJob(wsId, PREVIEW);
      jobId = job.id;
      expectJobShape(job, wsId);
      expect(job).toMatchObject({ kind: "routine", dryRun: true, status: "queued", steps: [], params: {} });
      expect(job.queue, "iş TEST kuyruğuna yazılır (canlı işçi almaz)").toBe(jobQueue);
      expect(job.approval, "kuru koşuda onay kaydı yok").toBeUndefined();
      expect(job.requestedBy?.trim(), "isteyen kullanıcı kaydedilir").toBeTruthy();
      expect(await r.getJob(wsId, job.id)).toEqual(job);
      expect((await activeJobs(r)).map((j) => j.id)).toEqual([job.id]);
      expect((await r.listJobs(wsId, { limit: 1 }))[0]?.id, "en yeni iş başta").toBe(job.id);

      // Tek etkin iş: tür ne olursa olsun ikinci istek reddedilir ve satır bırakmaz.
      await expectCode(r.requestJob(wsId, PREVIEW), "already_exists");
      await expectCode(r.requestJob(wsId, { kind: "analyze" }), "already_exists");
      expect((await activeJobs(r)).map((j) => j.id)).toEqual([job.id]);

      const cancelled = await r.cancelJob(wsId, job.id);
      expectJobShape(cancelled, wsId);
      expect(cancelled.status, "sıradaki iş anında durur").toBe("cancelled");
      expect(ms(cancelled.cancelRequestedAt)).toBeDefined();
      expect(cancelled.startedAt, "hiç başlamadı").toBeUndefined();
      await expectCode(r.cancelJob(wsId, job.id), "invalid_state");
      expect(await activeJobs(r)).toEqual([]);

      // Etkin iş kalmayınca yenisi açılır; para dışı parametreler `params`'a yazılır.
      const week = weekStartOf(new Date().toISOString().slice(0, 10));
      if (week === undefined) throw new Error("hafta hesaplanamadı");
      const plan = await r.requestJob(wsId, { kind: "plan", week });
      jobId = plan.id;
      expect(plan).toMatchObject({ kind: "plan", dryRun: false, status: "queued", params: { week } });
      expect(plan.approval, "harcamayan işte onay yok").toBeUndefined();
      await settle(r, plan.id);
      const collect = await r.requestJob(wsId, { kind: "collect", dryRun: true, limit: 5 });
      jobId = collect.id;
      expect(collect).toMatchObject({ kind: "collect", dryRun: true, params: { limit: 5 } });
    } finally {
      await settle(r, jobId);
    }
    expect(await activeJobs(r), "test açtığı işleri geri aldı").toEqual([]);
  });

  it("requestJob: geçersiz girdi ve ONAYSIZ HARCAMA invalid_input; hiçbiri satır bırakmaz", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "jobs", () => r.listJobs(wsId));
    const before = (await r.listJobs(wsId, { limit: MAX_PAGE_LIMIT })).map((job) => job.id);
    const bad: unknown[] = [
      null,
      {},
      { kind: "deploy" },
      { kind: "collect" }, // ONAYSIZ HARCAMA
      { kind: "measure" }, // ONAYSIZ HARCAMA
      { kind: "collect", dryRun: false, limit: 10 },
      { kind: "analyze", approval: { basis: "one_time", maxUsd: 0.2 } }, // harcamayan türe onay
      { kind: "analyze", dryRun: true }, // önizlemesi olmayan tür
      { kind: "collect", dryRun: true, approval: { basis: "one_time", maxUsd: 0.2 } }, // kuru koşuya onay
      { kind: "routine", dryRun: true, approval: { basis: "one_time", maxUsd: 0.2 } },
      { kind: "collect", approval: { basis: "one_time", maxUsd: 0 } },
      { kind: "collect", approval: { basis: "one_time", maxUsd: -1 } },
      { kind: "collect", approval: { basis: "one_time", maxUsd: JOB_SPEND_MAX_USD + 0.01 } },
      { kind: "collect", approval: { basis: "one_time", maxUsd: Number.NaN } },
      { kind: "collect", approval: { basis: "one_time", maxUsd: "0.2" } },
      { kind: "collect", approval: { basis: "one_time" } },
      { kind: "routine", approval: { basis: "forever" } },
      { kind: "collect", dryRun: true, limit: 0 },
      { kind: "collect", dryRun: true, limit: 2.5 },
      { kind: "plan", week: "2026-10-06" }, // Pazartesi değil
      { kind: "plan", week: "yarın" },
      { kind: "routine", dryRun: true, workspaceId: foreign }, // bilinmeyen alan: çalışma alanı girdiden okunmaz
      { kind: "routine", dryRun: true, queue: "panel" },
      { kind: "routine", dryRun: "true" },
    ];
    // Tür tablosunun kabul etmediği dayanak (karar: toplamada her seferinde tutar onayı).
    if (!JOB_KIND_SPEC.collect.approvalBases.includes("monthly_cap")) bad.push({ kind: "collect", approval: { basis: "monthly_cap" } });
    for (const input of bad) await expectCode(r.requestJob(wsId, input as RequestJobInput), "invalid_input");
    // Aylık tavan dayanağı yalnız tavan ONAYLI ve açıkken: değilse reddedilir (onaylıysa istek atılmaz: süit harcama işi açmaz).
    const workspace = await r.getWorkspace(wsId);
    if (workspace === null) throw new Error("seed: workspace yok");
    if (!availableApprovalBases("measure", workspace).includes("monthly_cap")) {
      await expectCode(r.requestJob(wsId, { kind: "measure", approval: { basis: "monthly_cap" } }), "invalid_input");
    }
    expect((await r.listJobs(wsId, { limit: MAX_PAGE_LIMIT })).map((job) => job.id), "reddedilen istek satır bırakmaz").toEqual(before);
    await expectCode(r.requestJob(foreign, PREVIEW), "not_found");
  });

  it("işçi işi alınca: çalışan iş yeni isteği engeller; cancelJob yalnız iptal isteği yazar (iş sürer, ilk istek korunur); bitince etkin iş kalmaz", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "jobs", () => r.listJobs(wsId));
    let jobId: string | undefined;
    try {
      jobId = (await r.requestJob(wsId, PREVIEW)).id;
      expect(await jobWorker.claim(r), "işçi sıradaki işi alır").toBe(jobId);
      const running = await r.getJob(wsId, jobId);
      if (running === null) throw new Error("alınan iş okunamadı");
      expectJobShape(running, wsId);
      expect(running.status).toBe("running");
      expect(running.cancelRequestedAt).toBeUndefined();
      await expectCode(r.requestJob(wsId, PREVIEW), "already_exists");
      expect(await jobWorker.claim(r), "kuyrukta çalışan iş varken ikinci iş alınmaz").toBeUndefined();

      const first = await r.cancelJob(wsId, jobId);
      expectJobShape(first, wsId);
      expect(first.status, "çalışan iş adım sınırına kadar sürer").toBe("running");
      expect(ms(first.cancelRequestedAt), "iptal isteği yazıldı").toBeDefined();
      const second = await r.cancelJob(wsId, jobId);
      expect([second.status, second.cancelRequestedAt], "tekrar çağrı ilk isteği korur").toEqual(["running", first.cancelRequestedAt]);

      await jobWorker.finish(r, jobId);
      const finished = await r.getJob(wsId, jobId);
      if (finished === null) throw new Error("biten iş okunamadı");
      expectJobShape(finished, wsId);
      expect(isActiveJob(finished)).toBe(false);
      await expectCode(r.cancelJob(wsId, jobId), "invalid_state");
    } finally {
      await settle(r, jobId);
    }
    expect(await activeJobs(r), "test açtığı işi geri aldı").toEqual([]);
  });

  it("getJob / cancelJob: bilinmeyen iş, biçimsiz kimlik ve başka çalışma alanı → null / not_found", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "jobs", () => r.listJobs(wsId));
    const [existing] = await r.listJobs(wsId, { limit: 1 });
    if (existing === undefined) throw new Error("seed: iş yok");
    expect(await r.getJob(wsId, MISSING_ID)).toBeNull();
    expect(await r.getJob(wsId, "not-a-uuid")).toBeNull();
    expect(await r.getJob(foreign, existing.id), "başka çalışma alanının işi okunmaz").toBeNull();
    await expectCode(r.cancelJob(wsId, MISSING_ID), "not_found");
    await expectCode(r.cancelJob(foreign, existing.id), "not_found");
    expect((await r.getJob(wsId, existing.id))?.status, "yabancı iptal işi değiştirmedi").toBe(existing.status);
  });
}
