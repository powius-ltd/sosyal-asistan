/**
 * İşçi testleri için ortak kurucular (yalnız testler içe aktarır): bellekte iş deposu (gerçek depoyla AYNI yama doğrulaması), alınmış iş
 * ve SAHTE bağımlılıklar. Hiçbir sahte para / kota harcayan gerçek modülü yüklemez; her çağrı casusla sayılır.
 */
import { vi } from "vitest";

import type { CollectPlan, CollectSummary } from "@/lib/collection/types";
import type { JobRowPatch } from "@/lib/data/job-schema";
import { RepositoryError } from "@/lib/data/repository";
import type { CreditHold } from "@/lib/domain/credits";
import { jobCreditKey } from "@/lib/domain/job-credits";
import type { JobStepStatus, PanelJob } from "@/lib/domain/panel-job";
import type { AnalyzeSummary } from "@/lib/intel/analyze-run";
import type { IntelContext } from "@/lib/intel/context";
import type { LabelSummary } from "@/lib/intel/label-run";
import type { PlanRunResult } from "@/lib/intel/plan-run";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import type { JobCreditsPort } from "@/lib/job-runner/job-credits";
import { validateJobPatch, type JobStore } from "@/lib/job-runner/job-store";
import type { RoutineDeps, StepRunner } from "@/lib/orchestrator/routine";
import type { RoutineWiring } from "@/lib/orchestrator/steps";
import { baseState, ok } from "@/lib/orchestrator/test-support";
import { ROUTINE_STEPS, type RoutineState, type RoutineStepId } from "@/lib/orchestrator/types";
import type { MeasureResult } from "@/lib/outcomes/measure-run";

export const NOW = new Date("2026-10-05T09:00:00.000Z");
export const WS_ID = "11111111-1111-4111-8111-111111111111";
export const USER_ID = "22222222-2222-4222-8222-222222222222";
export const WORKER_ID = "worker-test";

/** İşçinin aldığı (çalışan) iş. */
export function claimedJob(overrides: Partial<PanelJob> = {}): PanelJob {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    workspaceId: WS_ID,
    queue: "test_queue",
    kind: "analyze",
    dryRun: false,
    params: {},
    status: "running",
    steps: [],
    workerId: WORKER_ID,
    heartbeatAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    startedAt: NOW.toISOString(),
    ...overrides,
  };
}

/** `minutesAgo` dakika önce verilmiş tek seferlik onay. */
export const approval = (maxUsd: number, minutesAgo = 5) => ({ basis: "one_time" as const, maxUsd, approvedBy: USER_ID, approvedAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString() });

export interface FakeStore {
  store: JobStore;
  /** Yazılan yamalar, sırayla (çit kaybından sonrakiler dahil DEĞİL: onlar `rejected`'ta). */
  patches: JobRowPatch[];
  /** Çit yüzünden 0 satır etkileyen yazım sayısı. */
  rejected: number;
  /** Bundan sonraki yazımlar iptal isteğini görür. */
  requestCancel(): void;
  /** Bundan sonraki yazımlar 0 satır etkiler (iş elden alındı). */
  loseFence(): void;
  /** Her yazımdan ÖNCE çağrılır (belirli bir anda iptal / çit kaybı tetiklemek için). */
  onPatch(listener: (patch: JobRowPatch) => void): void;
  /** Kapanış yaması (durum yazılan son yama). */
  closing(): JobRowPatch | undefined;
  /** Adım yazımlarının zaman çizgisi: her yazımdaki `kimlik:durum` listesi. */
  timeline(): string[][];
  /** Son yazılan adımların durumu. */
  stepStatuses(): Record<string, JobStepStatus>;
}

export function fakeStore(queued: PanelJob[] = []): FakeStore {
  const patches: JobRowPatch[] = [];
  const listeners: ((patch: JobRowPatch) => void)[] = [];
  let cancelAt: string | undefined;
  let fenced = false;
  const fake: FakeStore = {
    patches,
    rejected: 0,
    requestCancel: () => {
      cancelAt = NOW.toISOString();
    },
    loseFence: () => {
      fenced = true;
    },
    onPatch: (listener) => {
      listeners.push(listener);
    },
    closing: () => patches.findLast((patch) => patch.status !== undefined),
    timeline: () => patches.flatMap((patch) => (Array.isArray(patch.steps) ? [(patch.steps as { id: string; status: string }[]).map((step) => `${step.id}:${step.status}`)] : [])),
    stepStatuses: () => {
      const last = patches.findLast((patch) => Array.isArray(patch.steps))?.steps as { id: string; status: JobStepStatus }[] | undefined;
      return Object.fromEntries((last ?? []).map((step) => [step.id, step.status]));
    },
    store: {
      claim: vi.fn(async () => queued.shift()),
      patch: vi.fn(async (_ref, patch) => {
        const body = validateJobPatch(patch);
        for (const listener of listeners) listener(body);
        if (fenced) {
          fake.rejected += 1;
          return { applied: false };
        }
        patches.push(body);
        return { applied: true, ...(cancelAt === undefined ? {} : { cancelRequestedAt: cancelAt }) };
      }),
      clearOldLogTails: vi.fn(async () => 0),
    },
  };
  return fake;
}

export const fakeContext = (now: Date, workspaceId: string): IntelContext =>
  ({ client: {}, repo: {}, workspaceId, workspaceSlug: "test", workspace: { name: "Test alanı", accountType: "business" }, now }) as unknown as IntelContext;

/** Planın hedefleri (iki ayrık hesap): profil koşusu ikisini, reel koşusu birini kapsar. */
const PLAN_TARGETS = [
  { handle: "test.hesap", platform: "instagram" },
  { handle: "rakip.bir", platform: "instagram" },
] as unknown as CollectPlan["jobs"][number]["targets"];

const collectPlan = (estimatedUsd: number, maxUsd: number): CollectPlan => ({
  jobs: [
    { label: "profil (2 hesap)", spec: {} as never, targets: PLAN_TARGETS, estimatedUsd: 0.01, priceUnknown: false },
    { label: "@test.hesap", spec: {} as never, targets: PLAN_TARGETS.slice(0, 1), estimatedUsd: Math.round((estimatedUsd - 0.01) * 1e6) / 1e6, priceUnknown: false },
  ],
  estimatedUsd,
  maxUsd,
  withinCeiling: estimatedUsd <= maxUsd,
  priceUnknown: false,
});

/** `collectOnce` özeti (sahte): kuru koşu → `dry_run`; tahmin tavanı aşıyorsa `blocked`; aksi halde temiz `completed`. */
export function collectSummary(options: { dryRun?: boolean; maxUsd?: number }, estimatedUsd = 0.11): CollectSummary {
  const plan = collectPlan(estimatedUsd, options.maxUsd ?? 0.2);
  const base = { plan, targets: [], runs: [], cost: { reservedUsd: 0, pendingReconcile: 0 }, notes: [] };
  if (options.dryRun) return { ...base, outcome: "dry_run" };
  if (!plan.withinCeiling) return { ...base, outcome: "blocked" };
  return { ...base, outcome: "completed", targets: [{ handle: "test.hesap", kind: "own", content: { parsed: 3, ingested: 3, snapshots: 3, notItems: 0, skipped: 0 } }], cost: { reservedUsd: estimatedUsd, actualUsd: 0.1, pendingReconcile: 0 } };
}

export const analyzeSummary = (overrides: Partial<AnalyzeSummary> = {}): AnalyzeSummary => ({
  outcome: "completed",
  selected: 3,
  ok: 3,
  insufficient: 0,
  failed: 0,
  skippedByCap: 0,
  expired: 0,
  missing: 0,
  agyCalls: 3,
  screening: { screened: 0, offNiche: 0, unscreenable: 0, unsure: 0, failed: 0 },
  seconds: 1,
  ...overrides,
});

export const labelSummary = (overrides: Partial<LabelSummary> = {}): LabelSummary => ({
  outcome: "completed",
  counts: { considered: 4, eligible: 4, alreadyLabeled: 0, offNiche: 0, notAnalyzed: 0, noText: 0, staleVersion: 0 },
  selected: 4,
  labeled: 4,
  verified: 4,
  unverified: 0,
  unsure: 0,
  unlabelable: 0,
  failed: 0,
  batches: 1,
  seconds: 1,
  ...overrides,
});

export const planResult = (overrides: Partial<PlanRunResult> = {}): PlanRunResult => ({ outcome: "saved", weekStart: "2026-10-12", status: "ready", confidence: "medium", ideas: 6, planned: 5, notes: [], markdown: "# plan", seconds: 1, ...overrides });

export const measureResult = (overrides: Partial<MeasureResult> = {}): MeasureResult => ({ outcome: "dry_run", dryRun: true, reelCount: 2, estimateUsd: 0.04, jobs: [{ label: "@test.hesap", actorId: "aktor", results: 2, usd: 0.04 }], accountCount: 1, notes: [], ...overrides });

export type FakeDeps = { [K in keyof JobRunnerDeps]: ReturnType<typeof vi.fn<JobRunnerDeps[K]>> };

/** Sahte tur bağlaması: gerçek `runRoutine` + `planRoutine` koşar; adımlar casustur, durum `wiring.args.apifyMaxUsd`'yi taşır. */
export interface FakeRoutine {
  /** `routineDeps` çağrılarında verilen bağlama (onaylı tavan burada görünür). */
  wirings: RoutineWiring[];
  steps: Record<RoutineStepId, ReturnType<typeof vi.fn<StepRunner>>>;
  precheck: ReturnType<typeof vi.fn<RoutineDeps["precheck"]>>;
  loadState: ReturnType<typeof vi.fn<RoutineDeps["loadState"]>>;
  writeReport: ReturnType<typeof vi.fn<RoutineDeps["writeReport"]>>;
  factory: JobRunnerDeps["routineDeps"];
}

export function fakeRoutine(state: Partial<RoutineState> = {}, runners: Partial<Record<RoutineStepId, StepRunner>> = {}): FakeRoutine {
  const wirings: RoutineWiring[] = [];
  const steps = Object.fromEntries(ROUTINE_STEPS.map((step) => [step, vi.fn<StepRunner>(runners[step] ?? (async () => ok()))])) as FakeRoutine["steps"];
  const precheck = vi.fn<RoutineDeps["precheck"]>(async () => ok("önkontrol tamam"));
  const writeReport = vi.fn<RoutineDeps["writeReport"]>(async () => [`Rapor: ${process.cwd()}/docs/rutin/test/2026-10-05.md`, "Bildirim yazıldı (routine:2026-10-05)."]);
  let current: RoutineWiring | undefined;
  const loadState = vi.fn<RoutineDeps["loadState"]>(async () => baseState({ now: NOW.toISOString(), ...state, ...(current?.args.apifyMaxUsd === undefined ? {} : { apifyMaxUsd: current.args.apifyMaxUsd }) }));
  return {
    wirings,
    steps,
    precheck,
    loadState,
    writeReport,
    factory: (_ctx, wiring) => {
      wirings.push(wiring);
      current = wiring;
      return { now: NOW, dryRun: wiring.args.dryRun, log: wiring.log, clock: () => 0, loadState, precheck, steps, writeReport };
    },
  };
}

/** Sahte bağımlılıklar: her işlev casus; varsayılanlar zararsız özet döndürür. `routine` verilmezse tur bağlaması çağrılınca hata verir. */
export function fakeDeps(overrides: Partial<JobRunnerDeps> = {}): FakeDeps {
  const deps: JobRunnerDeps = {
    createContext: async (now, workspaceId) => fakeContext(now, workspaceId),
    missingEnv: () => [],
    housekeeping: async () => undefined,
    collect: async (options) => collectSummary(options),
    measure: async (options) => measureResult({ dryRun: options.dryRun }),
    analyze: async () => analyzeSummary(),
    label: async () => labelSummary(),
    plan: async () => planResult(),
    briefing: async () => ({ ok: true, briefingId: "b", runId: "r", items: [], basis: {} as never, attempts: 1, seconds: 2, factsBytes: 10, omitted: {} }),
    cluster: async () => ({ outcome: "clustered", clusters: 2, contents: 8, notes: [], seconds: 1 }),
    routineDeps: () => {
      throw new Error("tur bağlaması verilmedi");
    },
    collectTargetCount: async () => 4,
    writePlanMarkdown: () => undefined,
    // Başlangıç işi (zararsız varsayılanlar; senaryolar `run-onboarding-test-support.ts`'te).
    verifyAccount: async () => ({ outcome: "ok", profile: { platform: "instagram", handle: "test.hesap", followers: 1500, missingFields: [] }, reservedUsd: 0.01 }),
    discover: async () => ({ outcome: "completed", sources: { related: { written: 0 }, coauthors: { found: 0, written: 0 }, search: { found: 0, written: 0, queries: [] } }, enriched: 0, written: 0, candidates: { total: 0 }, cost: { reservedUsd: 0, pendingReconcile: 0 }, notes: [] }),
    measureZernio: async () => ({ outcome: "key_missing" }),
    writeOrders: async () => ({ written: [], skipped: [], planFound: false }),
    returnOrders: async () => ({ outcome: "not_studio" }),
    publishOrders: async () => ({ outcome: "not_studio" }),
    draftNiche: async () => ({ draft: "Örnek konu taslağı." }),
    settleSpend: async () => ({ reservedUsd: 0, pending: 0 }),
    ...overrides,
  };
  return Object.fromEntries(Object.entries(deps).map(([name, fn]) => [name, vi.fn(fn as (...args: never[]) => unknown)])) as unknown as FakeDeps;
}

/** Yalnız kredi onayı taşıyan (USD onayı olmayan) işin onay kaydı: iş açılırken `maxCredits` kadar kredi ayrılmıştır. */
export const creditApproval = (maxCredits: number) => ({ basis: "credits" as const, maxCredits, approvedBy: USER_ID, approvedAt: NOW.toISOString() });

export interface FakeCredits {
  port: JobCreditsPort;
  /** İşin ayırması (yoksa undefined). */
  hold(jobId?: string): CreditHold | undefined;
  /** Ayırmayı dışarıdan kapatır (DB'nin yetim işi kapatırken bırakması gibi). */
  releaseOutside(jobId?: string): void;
  settled: { key: string; actual: number; units: CreditHold["units"]; priceVersion: string }[];
  released: string[];
  lookups: string[];
}

const DEFAULT_JOB_ID = "33333333-3333-4333-8333-333333333333";

/**
 * Sahte kredi defteri (işçi testleri): kurallar gerçek defterle aynıdır (kesinleşmiş ayırmada ikinci kesinleştirme İLK sonucu döndürür,
 * bırakılmış ayırma kesinleştirilemez, gerçekleşen ayrılanı aşamaz). `open`: iş kimliği → ayrılan kredi.
 */
export function fakeCredits(options: { enforced?: boolean; open?: Record<string, number> } = {}): FakeCredits {
  const holds = new Map<string, CreditHold>(
    Object.entries(options.open ?? {}).map(([jobId, amount]) => [jobCreditKey(jobId), { id: `hold-${jobId.slice(0, 8)}`, key: jobCreditKey(jobId), amount, status: "open", panelJobId: jobId, createdAt: NOW.toISOString() }]),
  );
  const need = (key: string): CreditHold => {
    const hold = holds.get(key);
    if (hold === undefined) throw new RepositoryError("not_found", "Kredi ayırması bulunamadı.");
    return hold;
  };
  const fake: FakeCredits = {
    settled: [],
    released: [],
    lookups: [],
    hold: (jobId = DEFAULT_JOB_ID) => holds.get(jobCreditKey(jobId)),
    releaseOutside: (jobId = DEFAULT_JOB_ID) => {
      const hold = need(jobCreditKey(jobId));
      holds.set(hold.key, { ...hold, status: "released", closedAt: NOW.toISOString() });
    },
    port: {
      enforced: options.enforced ?? false,
      findHold: vi.fn(async (key: string) => {
        fake.lookups.push(key);
        return holds.get(key);
      }),
      settle: vi.fn(async (input) => {
        fake.settled.push(input);
        const hold = need(input.key);
        if (hold.status === "settled") return hold;
        if (hold.status === "released") throw new RepositoryError("invalid_state", "Bırakılmış kredi ayırması kesinleştirilemez.");
        if (input.actual > hold.amount) throw new RepositoryError("invalid_input", "Gerçekleşen kredi ayrılanı aşamaz.");
        const settled: CreditHold = { ...hold, status: "settled", charged: input.actual, units: input.units, priceVersion: input.priceVersion, closedAt: NOW.toISOString() };
        holds.set(hold.key, settled);
        return settled;
      }),
      release: vi.fn(async (key: string) => {
        fake.released.push(key);
        const hold = need(key);
        if (hold.status !== "open") return hold;
        const released: CreditHold = { ...hold, status: "released", closedAt: NOW.toISOString() };
        holds.set(key, released);
        return released;
      }),
      sweep: vi.fn(async () => 0),
    },
  };
  return fake;
}
