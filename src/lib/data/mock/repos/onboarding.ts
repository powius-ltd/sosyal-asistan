/**
 * Mock depo: başlangıç akışı (`OnboardingRepository`). Kurallar Supabase ile AYNI: adım `buildOnboardingState` ile türetilir, eylem koruması
 * `assertOnboardingAction`, rakip denetimi `rivalsToTrack`; iş `requestJob` üzerinden açılır (onay sunucuda, sabit tavan).
 *
 * Mock'a özel kolaylıklar (ekranlar örnek veriyle uçtan uca gezilebilsin; hepsi `MockRepositoryOptions.onboarding` ile, varsayılan KAPALI):
 *  - `start`: akışın başladığı adım. `done` (varsayılan) = mock hesabı akıştan önce kurulmuş sayılır (`legacy`). Başka her değerde hesap
 *    GERÇEKTEN BOŞ başlar (`onboarding-fresh.ts`: tohumlu içerik / plan / ölçüm kenara alınır, ilk inceleme bitince geri konur) ve o adımın
 *    örnek iş satırları tohumlanır.
 *  - `autoAdvance`: mock'ta işçi yoktur; açıkken HER `getOnboardingState` okuması etkin başlangıç işini bir adım ilerletir (sırada → çalışıyor
 *    → adım adım → bitti, örnek çıktıyla). Sözleşme testleri kapalı koşar (işi `testing.claimJob` / `finishJob` ilerletir).
 *  - `pollAdvance`: iş okumaları da (`listJobs`, `getJob`: ekranın yoklama ucu `/api/isler` bunları okur) işi ilerletir; böylece sayfa yenilenmeden
 *    ilerleme akar ve bitiş yoklamada görülür (baloncuk, sekme işareti). `autoAdvance` ile birlikte anlamlıdır.
 *  - `advanceEveryMs`: ardışık iki ilerleme arası en az gerçek süre (uygulama yolu verir; testler vermez). Bir sayfa çizimi birkaç okuma yapar;
 *    sınır olmazsa bakış ilk çizimde biter ve ilerleme görülmez.
 */
import { parseAddOnboardingRival, parseConfirmOnboardingAccount, parseStartOnboardingBuild } from "@/lib/data/onboarding-input";
import { MOCK_WORKER_ID } from "@/lib/data/mock/generators/jobs";
import { discoveryViews } from "@/lib/data/mock/mock-filters";
import type { MockContext } from "@/lib/data/mock/repos/context";
import type { JobMethods } from "@/lib/data/mock/repos/jobs";
import { createFreshData } from "@/lib/data/mock/repos/onboarding-fresh";
import { RepositoryError } from "@/lib/data/repository";
import type { OnboardingRepository } from "@/lib/data/repository-onboarding";
import { assertOnboardingAction, buildOnboardingState, normalizeRivalHandle, ONBOARDING_ERROR, onboardingDiscardProblem, rivalsToTrack } from "@/lib/data/views/onboarding";
import type { Competitor } from "@/lib/domain/competitor";
import type { OnboardingState } from "@/lib/domain/onboarding";
import { ONBOARDING_COLLECT_LIMIT, ONBOARDING_NICHE_DRAFT_MAX_CHARS, ONBOARDING_PHASE_SPEC, onboardingPhaseOf, onboardingStepsOf, type OnboardingPhase, type OnboardingProbeResult } from "@/lib/domain/onboarding-job";
import { onboardingFinishDedupeKey, onboardingFinishInputOf } from "@/lib/domain/onboarding-finish";
import { isActiveJob, type JobOutcomeCode, type JobStatus, type JobStep, type PanelJob } from "@/lib/domain/panel-job";
import { onboardingFinishNotice } from "@/lib/plain-language-onboarding";
import { hasPlatformModule } from "@/lib/platforms/registry";
import { truncateText } from "@/lib/text";
import { MOCK_USER_ID } from "@/lib/workspace/current";

const DONE_BUILD: readonly JobStatus[] = ["succeeded", "partial"];
const NICHE_DRAFT_FALLBACK = "Videolarında en çok işlediğin konular ve kime seslendiğin burada taslak olarak yazılır; istediğin gibi düzelt.";

export interface OnboardingMock {
  methods: OnboardingRepository;
  /** İş okumasında (yoklama ucu) işi ilerletir: yalnız `autoAdvance` + `pollAdvance` açıkken; kapalıyken hiçbir şey yapmaz. */
  advanceOnJobRead(): void;
}

export function createOnboardingMethods(ctx: MockContext, jobs: Pick<JobMethods, "requestJob">): OnboardingMock {
  const { state, clock, ws, requireWs, nextId, out } = ctx;
  const start = ctx.onboarding.start ?? "done";
  const fresh = start !== "done";
  const freshData = createFreshData(ctx);
  if (fresh) freshData.clear();
  let confirmedAt: string | undefined;
  /** Bitiş bildirimi yazılan işler (Supabase'de `dedupe_key` benzersiz indeksi). */
  const notified = new Set<string>();

  const account = () => state.ownAccounts[0];
  const onboardingJobs = () => state.jobs.filter((job) => job.kind === "onboarding");
  const rivals = (status: "candidate" | "tracked") => state.competitors.filter((c) => c.status === status && c.platform === account()?.platform);

  function probeResult(): OnboardingProbeResult | undefined {
    const own = account();
    if (own === undefined) return undefined;
    const candidates = discoveryViews(state.competitors, state.ownAccounts, { platform: own.platform });
    const followers = freshData.seededFollowers(own.id);
    return {
      profile: {
        platform: own.platform,
        handle: own.handle,
        ...(own.displayName === undefined ? {} : { displayName: own.displayName }),
        ...(followers === undefined ? {} : { followers }),
      },
      videoCount: Math.min(ONBOARDING_COLLECT_LIMIT, freshData.seededContentCount()),
      candidates: { total: rivals("candidate").length, similarSize: candidates.filter((view) => view.similarSize === true).length },
      suggestedAccountType: ws.accountType,
      nicheDraft: truncateText(ws.nicheBrief ?? NICHE_DRAFT_FALLBACK, ONBOARDING_NICHE_DRAFT_MAX_CHARS),
    };
  }

  /** Örnek iş satırı (tohum): bitmiş ya da `at` adımında çalışan. */
  function seedJob(phase: OnboardingPhase, status: JobStatus, extra: { at?: number; outcome?: JobOutcomeCode } = {}): void {
    const steps = onboardingStepsOf(phase);
    const createdAt = clock.tick();
    const startedAt = clock.tick();
    const finished = !isActiveJob({ status });
    const written: JobStep[] =
      status === "blocked"
        ? [{ id: steps[0], status: "failed", ...(extra.outcome === undefined ? {} : { code: extra.outcome }) }]
        : steps.slice(0, finished ? steps.length : (extra.at ?? 0) + 1).map((id, index) => ({ id, status: finished || index < (extra.at ?? 0) ? "ok" : "running" }));
    const probe = phase === "probe" && status === "succeeded" ? probeResult() : undefined;
    const current = finished ? undefined : steps[extra.at ?? 0];
    state.jobs.push({
      id: nextId("job"),
      workspaceId: ws.id,
      queue: ctx.jobQueue,
      kind: "onboarding",
      dryRun: false,
      params: { phase },
      status,
      approval: { basis: "onboarding", maxUsd: ONBOARDING_PHASE_SPEC[phase].maxUsd, approvedBy: MOCK_USER_ID, approvedAt: createdAt },
      steps: written,
      ...(current === undefined ? {} : { currentStep: current }),
      ...(current === "analyze" ? { progress: { done: 7, total: 19 } } : {}),
      ...(finished ? { result: { ...(extra.outcome === undefined ? { exitCode: 0 } : { outcome: extra.outcome }), ...(probe === undefined ? {} : { probe }) } } : {}),
      workerId: MOCK_WORKER_ID,
      requestedBy: MOCK_USER_ID,
      createdAt,
      startedAt,
      heartbeatAt: startedAt,
      ...(finished ? { finishedAt: clock.tick() } : {}),
    });
  }

  // Tohum: istenen adımın örnek durumu (aynı seçenek → aynı durum).
  if (start === "probing") seedJob("probe", "running", { at: 1 });
  if (start === "blocked") seedJob("probe", "blocked", { outcome: "account_private" });
  if (start === "review_account" || start === "choose_rivals" || start === "building") seedJob("probe", "succeeded");
  if (start === "choose_rivals" || start === "building") confirmedAt = clock.tick();
  if (start === "building") seedJob("build", "running", { at: 1 });
  // Bakışı bitmiş örnek durumlarda profil sayıları (takipçi) bilinir; içerik / plan ilk incelemeyi bekler.
  if (start === "review_account" || start === "choose_rivals" || start === "building") freshData.restoreProfile();

  function read(): OnboardingState {
    const all = onboardingJobs();
    const builds = all.filter((job) => onboardingPhaseOf(job) === "build");
    const built = builds.some((job) => DONE_BUILD.includes(job.status));
    return buildOnboardingState({
      workspace: ws,
      ...(confirmedAt === undefined ? {} : { accountConfirmedAt: confirmedAt }),
      ownAccounts: state.ownAccounts,
      jobs: all,
      candidateCount: rivals("candidate").length,
      // Taze hesapta tohum verisi akışın olgusu değildir: ilk tur başlayana kadar izlenen rakip / içerik / plan "yok" sayılır.
      trackedCount: fresh && builds.length === 0 ? 0 : rivals("tracked").length,
      hasPlan: fresh ? built : state.weeklyPlans.length > 0,
      hasContent: fresh ? built : state.content.length > 0,
    });
  }

  let lastAdvanceMs = Number.NEGATIVE_INFINITY;

  /** İşçi yerine: etkin başlangıç işini bir adım ilerletir (yalnız `autoAdvance`; `advanceEveryMs` varsa gerçek süre sınırıyla). */
  function advance(): void {
    const every = ctx.onboarding.advanceEveryMs;
    if (every !== undefined) {
      const nowMs = Date.now();
      if (nowMs - lastAdvanceMs < every) return;
      lastAdvanceMs = nowMs;
    }
    const job: PanelJob | undefined = onboardingJobs().find(isActiveJob);
    const phase = job === undefined ? undefined : onboardingPhaseOf(job);
    if (job === undefined || phase === undefined) return;
    const steps = onboardingStepsOf(phase);
    const at = clock.tick();
    job.heartbeatAt = at;
    if (job.status === "queued") {
      Object.assign(job, { status: "running", workerId: MOCK_WORKER_ID, startedAt: at, steps: [{ id: steps[0], status: "running" }], currentStep: steps[0] });
      return;
    }
    const index = Math.max(0, steps.indexOf(job.currentStep ?? steps[0]));
    const next = steps[index + 1];
    job.steps = steps.slice(0, index + 1).map((id) => ({ id, status: "ok" }));
    delete job.progress;
    if (next !== undefined) {
      job.steps.push({ id: next, status: "running" });
      job.currentStep = next;
      if (next === "analyze") job.progress = { done: 7, total: 19 };
      return;
    }
    const probe = phase === "probe" ? probeResult() : undefined;
    delete job.currentStep;
    Object.assign(job, { status: "succeeded", finishedAt: at, result: { exitCode: 0, ...(probe === undefined ? {} : { probe }) } });
    notifyFinished(job);
    // Bakış profil sayılarını getirir; veri (içerik, plan, ölçüm) ilk inceleme bitince gelir.
    if (phase === "probe") freshData.restoreProfile();
    else freshData.restore();
  }

  /** İşçi yerine bitiş bildirimi (gerçekte işçi yazar: `job-runner/finish-notice.ts`); aynı iş için bir kez. */
  function notifyFinished(job: PanelJob): void {
    const notice = onboardingFinishNotice(onboardingFinishInputOf(job, job));
    const key = onboardingFinishDedupeKey(job.id);
    if (notice === undefined || notified.has(key)) return;
    notified.add(key);
    state.notifications.push({ id: `nt_onb_${job.id}`, workspaceId: ws.id, kind: "onboarding", title: notice.title, body: notice.body, createdAt: clock.tick() });
  }

  const methods: OnboardingRepository = {
    async getOnboardingState(wsId) {
      requireWs(wsId);
      if (ctx.onboarding.autoAdvance === true) advance();
      return out(read());
    },

    async startOnboardingProbe(wsId) {
      requireWs(wsId);
      const current = read();
      assertOnboardingAction(current, "start_probe");
      if (current.account === undefined || !hasPlatformModule(current.account.platform)) throw new RepositoryError("invalid_state", ONBOARDING_ERROR.noModule);
      return jobs.requestJob(wsId, { kind: "onboarding", phase: "probe" });
    },

    async confirmOnboardingAccount(wsId, input) {
      requireWs(wsId);
      const valid = parseConfirmOnboardingAccount(input);
      assertOnboardingAction(read(), "confirm_account");
      ws.accountType = valid.accountType;
      if (valid.nicheBrief !== undefined) ws.nicheBrief = valid.nicheBrief === "" ? undefined : valid.nicheBrief;
      confirmedAt = clock.tick();
      return out(read());
    },

    async startOnboardingBuild(wsId, input) {
      requireWs(wsId);
      const { rivalIds } = parseStartOnboardingBuild(input);
      const current = read();
      assertOnboardingAction(current, "start_build");
      if (current.account === undefined) throw new RepositoryError("invalid_state", ONBOARDING_ERROR.noModule);
      const toTrack = rivalsToTrack(state.competitors, rivalIds, current.account.platform);
      // Önce iş (onay kaydı), sonra izleme: iş yazılamazsa hiçbir rakip izlemeye alınmaz.
      const job = await jobs.requestJob(wsId, { kind: "onboarding", phase: "build", ...(rivalIds.length === 0 ? {} : { rivalIds }) });
      for (const competitor of state.competitors) if (toTrack.includes(competitor.id)) competitor.status = "tracked";
      return job;
    },

    async addOnboardingRival(wsId, input) {
      requireWs(wsId);
      const { handle: raw } = parseAddOnboardingRival(input);
      const current = read();
      assertOnboardingAction(current, "start_build");
      const platform = current.account?.platform;
      if (platform === undefined) throw new RepositoryError("invalid_state", ONBOARDING_ERROR.noModule);
      const handle = normalizeRivalHandle(raw);
      if (state.competitors.some((c) => c.platform === platform && c.handle === handle)) throw new RepositoryError("already_exists", `@${handle} zaten ekli.`);
      // `addCompetitor`'dan farkı: bütçe rezervi ve profil koşusu YOK (aday; profil ilk turda gelir).
      const competitor: Competitor = {
        id: nextId("cp"),
        workspaceId: wsId,
        platform,
        handle,
        status: "candidate",
        source: "manual",
        missingFields: ["followers", "following", "postsCount"],
        contentCount: 0,
        addedAt: clock.tick(),
      };
      state.competitors.push(competitor);
      return out(competitor);
    },

    async discardOnboardingWorkspace(wsId) {
      requireWs(wsId);
      // Kurulu (legacy) örnek hesap ve iş koşmuş hesap kaldırılamaz; taze hesapta kural geçerse de örnekte tek çalışma alanı vardır: kalkmaz.
      const problem = fresh ? onboardingDiscardProblem({ accountConfirmed: confirmedAt !== undefined, jobs: state.jobs.filter((job) => job.workspaceId === ws.id) }) : ONBOARDING_ERROR.notDiscardable;
      if (problem !== undefined) throw new RepositoryError("invalid_state", problem);
    },
  };

  return {
    methods,
    advanceOnJobRead() {
      if (ctx.onboarding.autoAdvance === true && ctx.onboarding.pollAdvance === true) advance();
    },
  };
}
