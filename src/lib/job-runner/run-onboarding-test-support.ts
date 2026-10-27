/**
 * Başlangıç işi testleri için ortak kurucular (yalnız testler içe aktarır): başlangıç onayı, sahte özetler ve işi SAHTE bağımlılıklarla
 * koşturan `runOnboarding`. Gerçek Apify / yazı aracı / veritabanı modülü yüklenmez; her çağrı casusla sayılır.
 */
import type { DiscoverSummary } from "@/lib/collection/discover";
import type { AccountVerification } from "@/lib/collection/discover-account";
import type { CollectSummary, TargetReport } from "@/lib/collection/types";
import { ONBOARDING_PHASE_SPEC, type OnboardingPhase } from "@/lib/domain/onboarding-job";
import type { JobOutcomeCode, JobResult, JobStepStatus, PanelJob } from "@/lib/domain/panel-job";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import type { JobFinishedHook } from "@/lib/job-runner/finish-notice";
import { runJob } from "@/lib/job-runner/run-job";
import { analyzeSummary, claimedJob, fakeCredits, fakeDeps, fakeRoutine, fakeStore, NOW, planResult, USER_ID, WORKER_ID, type FakeRoutine, type FakeStore } from "@/lib/job-runner/test-support";
import type { StepRunner } from "@/lib/orchestrator/routine";
import { ok } from "@/lib/orchestrator/test-support";
import type { RoutineState, RoutineStepId } from "@/lib/orchestrator/types";
import type { NormalizedProfile } from "@/lib/platforms/types";

export const JOB_ID = claimedJob().id;

/** Akıştaki düğmenin yazdığı onay: aşamanın sabit tavanı (+ zorlama açıksa kredi tavanı). */
export const onboardingApproval = (phase: OnboardingPhase, options: { minutesAgo?: number; maxUsd?: number; maxCredits?: number } = {}) => ({
  basis: "onboarding" as const,
  maxUsd: options.maxUsd ?? ONBOARDING_PHASE_SPEC[phase].maxUsd,
  ...(options.maxCredits === undefined ? {} : { maxCredits: options.maxCredits }),
  approvedBy: USER_ID,
  approvedAt: new Date(NOW.getTime() - (options.minutesAgo ?? 5) * 60_000).toISOString(),
});

export const profileOf = (overrides: Partial<NormalizedProfile> = {}): NormalizedProfile => ({
  platform: "instagram",
  handle: "test.hesap",
  displayName: "Test Hesabı",
  bio: "Kısa biyografi.",
  followers: 1500,
  postsCount: 80,
  isVerified: false,
  isBusinessAccount: true,
  avatarUrl: "https://cdn.ornek.test/foto.jpg",
  relatedHandles: ["ilgili.bir"],
  missingFields: [],
  ...overrides,
});

export const verified = (overrides: Partial<AccountVerification> = {}): AccountVerification => ({ outcome: "ok", profile: profileOf(), reservedUsd: 0.01, ...overrides });

const content = (parsed: number, extra: Partial<NonNullable<TargetReport["content"]>> = {}): NonNullable<TargetReport["content"]> => ({ parsed, ingested: parsed, snapshots: parsed, notItems: 0, skipped: 0, ...extra });

/** Tamamlanmış toplama özeti. `own`: kendi hesabın video sayısı; `rivals`: rakip başına video sayısı ya da hata metni. */
export function collected(own: number | Partial<TargetReport>, rivals: (number | string)[] = [], reservedUsd = 0.07): CollectSummary {
  const ownReport: TargetReport = typeof own === "number" ? { handle: "test.hesap", kind: "own", profile: { state: "ok", followers: 1500 }, content: content(own) } : { handle: "test.hesap", kind: "own", ...own };
  const rivalReports = rivals.map((rival, index): TargetReport => ({ handle: `rakip.${index + 1}`, kind: "competitor", profile: { state: "ok" }, content: typeof rival === "number" ? content(rival) : content(0, { error: rival }) }));
  return { outcome: "completed", targets: [ownReport, ...rivalReports], runs: [], cost: { reservedUsd, pendingReconcile: 0 }, notes: [] };
}

export const discovered = (overrides: Partial<DiscoverSummary> = {}): DiscoverSummary => ({
  outcome: "completed",
  sources: { related: { written: 2 }, coauthors: { found: 3, written: 2 }, search: { found: 12, written: 8, queries: ["yogadersi"] } },
  enriched: 4,
  written: 10,
  candidates: { total: 12, similarSize: 5 },
  cost: { reservedUsd: 0.05, pendingReconcile: 0 },
  notes: [],
  ...overrides,
});

export interface OnboardingSetup {
  deps?: Partial<JobRunnerDeps>;
  /** `build`: turun durum okuması (her çağrıda yeniden sorulur) ve adım koşucuları. */
  state?: () => Partial<RoutineState>;
  runners?: (routine: () => FakeRoutine) => Partial<Record<RoutineStepId, StepRunner>>;
  /** Kredi zorlaması: işin açık ayırması (verilmezse zorlama kapalı). */
  reserved?: number;
  arrange?: (fake: FakeStore, routine: FakeRoutine) => void;
  timeoutMs?: number;
  /** İş kapandıktan sonra çağrılan kanca (bitiş bildirimi). */
  onFinished?: JobFinishedHook;
}

export interface WrittenStep {
  id: string;
  status: JobStepStatus;
  code?: JobOutcomeCode;
  note?: string;
}

/** Turun adımları GERÇEK adımlar gibi özetlerini kancalara bildirir (inceleme: 3 video; plan: kaydedildi). */
export function buildRunners(routine: () => FakeRoutine, seen: { analyzeLimit?: number } = {}): Partial<Record<RoutineStepId, StepRunner>> {
  const wiring = () => routine().wirings[0];
  return {
    analyze: async () => {
      seen.analyzeLimit = wiring().analyzeLimit?.();
      await wiring().analyzeHooks?.onProgress?.({ done: 1, total: seen.analyzeLimit ?? 0 });
      wiring().onAnalyzed?.(analyzeSummary());
      return ok("3 video incelendi");
    },
    plan: async () => {
      wiring().onPlanned?.(planResult());
      return ok("plan kaydedildi");
    },
  };
}

export async function runOnboarding(phase: OnboardingPhase, job: Partial<PanelJob> = {}, setup: OnboardingSetup = {}) {
  const fake = fakeStore();
  const routine: FakeRoutine = fakeRoutine({}, (setup.runners ?? buildRunners)(() => routine));
  if (setup.state !== undefined) {
    const state = setup.state;
    const base = routine.loadState.getMockImplementation();
    routine.loadState.mockImplementation(async () => ({ ...(await base?.()), ...state() }) as RoutineState);
  }
  const deps = fakeDeps({ routineDeps: routine.factory, verifyAccount: async () => verified(), collect: async () => collected(25), discover: async () => discovered(), ...setup.deps });
  const credits = fakeCredits({ enforced: setup.reserved !== undefined, open: setup.reserved === undefined ? {} : { [JOB_ID]: setup.reserved } });
  setup.arrange?.(fake, routine);
  const log: string[] = [];
  const approval = onboardingApproval(phase, setup.reserved === undefined ? {} : { maxCredits: setup.reserved });
  const result = await runJob(claimedJob({ kind: "onboarding", params: { phase }, approval, ...job }), {
    store: fake.store,
    deps,
    credits: credits.port,
    workerId: WORKER_ID,
    clock: () => NOW,
    clockMs: () => 0,
    echo: (line) => log.push(line),
    heartbeatMs: 60_000,
    ...(setup.onFinished === undefined ? {} : { onFinished: setup.onFinished }),
    ...(setup.timeoutMs === undefined ? {} : { timeoutMs: setup.timeoutMs, hardGraceMs: 60_000 }),
  });
  const steps = (fake.patches.findLast((patch) => Array.isArray(patch.steps))?.steps ?? []) as unknown as WrittenStep[];
  const closing = fake.closing();
  return {
    fake,
    routine,
    deps,
    credits,
    result,
    log,
    closing,
    /** Kapanışta yazılan sonuç. */
    written: (closing?.result ?? undefined) as JobResult | undefined,
    steps,
    step: (id: string) => steps.find((entry) => entry.id === id),
    statuses: () => Object.fromEntries(steps.map((entry) => [entry.id, entry.status])),
    /** "Sürüyor" yazılan adımlar, sırayla. */
    ran: () =>
      fake
        .timeline()
        .flatMap((entries) => entries.filter((entry) => entry.endsWith(":running")).map((entry) => entry.split(":")[0]))
        .filter((id, index, all) => all[index - 1] !== id),
  };
}

/** Adım `step` sürerken (satıra "sürüyor" yazılırken) tetiklenir. */
export const whileRunning = (fake: FakeStore, step: string, trigger: () => void) =>
  fake.onPatch((patch) => {
    if (patch.current_step === step) trigger();
  });
