import { describe, expect, it } from "vitest";

import { jobResultSchema, jobStepsSchema } from "@/lib/data/job-schema";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/lib/domain/onboarding";
import { ONBOARDING_PHASE_SPEC, onboardingStepsOf } from "@/lib/domain/onboarding-job";
import { toJobStatusView } from "@/lib/domain/panel-job-view";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { kpiOf } from "@/lib/overview/period-change";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const QUEUE = "onboarding_mock";
const repoAt = (start?: OnboardingStep, autoAdvance = false, pollAdvance = false) =>
  createMockRepository(undefined, { jobQueue: QUEUE, onboarding: { start, autoAdvance, pollAdvance } });

describe("mock başlangıç akışı: her adım için tohumlu örnek durum", () => {
  it("seçenek verilmezse akış kapalı: kurulu hesap, başlangıç işi yok", async () => {
    const repo = createMockRepository(undefined, { jobQueue: QUEUE });
    expect(await repo.getOnboardingState(WS)).toMatchObject({ step: "done", reason: "legacy" });
    expect((await repo.listJobs(WS)).filter((job) => job.kind === "onboarding")).toEqual([]);
  });

  it("start = <adım> → getOnboardingState o adımı verir; tohum işleri satır sözleşmesine uyar", async () => {
    for (const step of ONBOARDING_STEPS) {
      const repo = repoAt(step);
      const state = await repo.getOnboardingState(WS);
      expect(state.step, step).toBe(step);
      for (const job of (await repo.listJobs(WS)).filter((j) => j.kind === "onboarding")) {
        expect(jobStepsSchema.safeParse(job.steps).success, `${step}: steps`).toBe(true);
        if (job.result !== undefined) expect(jobResultSchema.safeParse(job.result).success, `${step}: result`).toBe(true);
        expect(job.approval, `${step}: sabit tavanlı onay`).toMatchObject({ basis: "onboarding", maxUsd: ONBOARDING_PHASE_SPEC[job.params.phase ?? "probe"].maxUsd });
      }
    }
  });

  it("örnek durumların içeriği: bakışta profil özeti, gizli hesapta neden, ilk turda sayaç", async () => {
    const review = await repoAt("review_account").getOnboardingState(WS);
    expect(review.probe?.profile.handle).toBe(review.account?.handle);
    expect(review.probe?.videoCount).toBeGreaterThan(0);
    expect(review.probe?.nicheDraft).toBeTruthy();
    expect(review.next).toBe("confirm_account");
    expect(review.accountConfirmedAt).toBeUndefined();

    expect(await repoAt("blocked").getOnboardingState(WS)).toMatchObject({ step: "blocked", reason: "account_private", next: "start_probe" });

    const building = repoAt("building");
    const state = await building.getOnboardingState(WS);
    const job = await building.getJob(WS, state.activeJobId ?? "");
    expect(job).toMatchObject({ status: "running", currentStep: "analyze", progress: { done: 7, total: 19 } });
    // Müşteri görünümü: tutar / onay sızmaz (ilerleme ekranı bunu kullanır).
    expect(job && toJobStatusView(job, { now: new Date(MOCK_NOW), operator: false })).not.toHaveProperty("operator");
  });
});

describe("mock başlangıç akışı: işçisiz ilerleme (autoAdvance)", () => {
  it("hesap ekle → bakış → onay → Başlat → plan: her okuma işi bir adım ilerletir; rakipsiz yol geçerli", async () => {
    const repo = repoAt("add_account", true);
    expect(await repo.getOnboardingState(WS)).toMatchObject({ step: "add_account", next: "start_probe" });

    const probe = await repo.startOnboardingProbe(WS);
    const seen: string[] = [];
    let state = await repo.getOnboardingState(WS);
    for (let reads = 0; state.step === "probing" && reads < 20; reads++) {
      seen.push((await repo.getJob(WS, probe.id))?.currentStep ?? "-");
      state = await repo.getOnboardingState(WS);
    }
    expect(seen, "bakışın adımları sırayla görülür").toEqual([...onboardingStepsOf("probe")]);
    expect(state).toMatchObject({ step: "review_account", next: "confirm_account" });
    expect(state.probe?.profile.handle).toBe(state.account?.handle);
    expect((await repo.getJob(WS, probe.id))?.steps.map((step) => step.status)).toEqual(onboardingStepsOf("probe").map(() => "ok"));

    state = await repo.confirmOnboardingAccount(WS, { accountType: "creator", nicheBrief: "" });
    expect(state).toMatchObject({ step: "choose_rivals", accountType: "creator", next: "start_build" });
    expect(state.nicheBrief, "boş metin konu tanımını siler").toBeUndefined();

    const trackedBefore = (await repo.listCompetitors(WS, { status: "tracked" })).length;
    const build = await repo.startOnboardingBuild(WS, { rivalIds: [] });
    expect(build.params).toEqual({ phase: "build" });
    expect((await repo.listCompetitors(WS, { status: "tracked" })).length, "rakipsiz: kimse izlemeye alınmaz").toBe(trackedBefore);
    for (let reads = 0; reads < 20 && (state = await repo.getOnboardingState(WS)).step === "building"; reads++);
    expect(state).toMatchObject({ step: "done", reason: "plan_ready" });
    expect((await repo.getJob(WS, build.id))?.status).toBe("succeeded");
  });

  it("iş bitince zile TEK bildirim düşer (işçinin yazdığı gibi); okumalar tekrarlamaz", async () => {
    const repo = repoAt("add_account", true);
    const titles = async () => (await repo.listNotifications(WS)).items.filter((n) => n.kind === "onboarding").map((n) => n.title);
    expect(await titles()).toEqual([]);
    await repo.startOnboardingProbe(WS);
    for (let reads = 0; reads < 20 && (await repo.getOnboardingState(WS)).step === "probing"; reads++);
    expect(await titles()).toEqual(["Hesabına baktım, sıra sende"]);
    await repo.getOnboardingState(WS);
    expect(await titles(), "aynı iş için ikinci bildirim yok").toHaveLength(1);
    const before = await repo.countUnreadNotifications(WS);
    expect(before).toBeGreaterThan(0);

    await repo.confirmOnboardingAccount(WS, { accountType: "creator" });
    await repo.startOnboardingBuild(WS, { rivalIds: [] });
    for (let reads = 0; reads < 20 && (await repo.getOnboardingState(WS)).step === "building"; reads++);
    expect(await titles()).toEqual(["İlk planın hazır", "Hesabına baktım, sıra sende"]);
    expect(await repo.countUnreadNotifications(WS), "zil rozeti sayısı bildirimle artar").toBeGreaterThan(before);
    expect((await repo.listNotifications(WS, { unreadOnly: true })).items.map((n) => n.title)).toContain("İlk planın hazır");
  });

  it("ilerleme kapalıyken okuma işi DEĞİŞTİRMEZ (sözleşme testleri bununla koşar)", async () => {
    const repo = repoAt("add_account");
    const probe = await repo.startOnboardingProbe(WS);
    for (let i = 0; i < 3; i++) expect((await repo.getOnboardingState(WS)).step).toBe("probing");
    expect((await repo.getJob(WS, probe.id))?.status).toBe("queued");
  });
});

describe("mock başlangıç akışı: deneme sınırı ve seçim kuralları (DB kurallarıyla aynı)", () => {
  it("durdurulan bakış yeniden başlatılabilir; hak bitince başlatılamaz", async () => {
    const repo = repoAt("add_account");
    const max = ONBOARDING_PHASE_SPEC.probe.attemptsMax;
    for (let attempt = 1; attempt <= max; attempt++) {
      const job = await repo.startOnboardingProbe(WS);
      await repo.cancelJob(WS, job.id);
      const state = await repo.getOnboardingState(WS);
      expect(state.attemptsLeft.probe).toBe(max - attempt);
      expect(state).toMatchObject(attempt < max ? { step: "blocked", reason: "probe_failed", next: "start_probe" } : { step: "blocked", reason: "attempts_exhausted", next: "add_account" });
    }
    await expect(repo.startOnboardingProbe(WS)).rejects.toMatchObject({ code: "invalid_state" });
    await expect(repo.requestJob(WS, { kind: "onboarding", phase: "probe" }), "doğrudan iş isteği de sınırı aşamaz").rejects.toMatchObject({ code: "invalid_state" });
  });

  it("Başlat: yalnız aynı platformdan aday / izlenen rakip seçilebilir; seçilen aday izlemeye alınır", async () => {
    const repo = repoAt("choose_rivals");
    const account = (await repo.getOnboardingState(WS)).account;
    const all = await repo.listCompetitors(WS);
    const candidate = all.find((c) => c.status === "candidate" && c.platform === account?.platform);
    const otherPlatform = all.find((c) => c.status === "candidate" && c.platform !== account?.platform);
    const ignored = all.find((c) => c.status === "ignored");
    if (!candidate || !otherPlatform || !ignored) throw new Error("mock tohumu: aynı / başka platformdan aday ve yoksayılan rakip bekleniyor");

    await expect(repo.startOnboardingBuild(WS, { rivalIds: [otherPlatform.id] })).rejects.toMatchObject({ code: "invalid_input", message: "Rakip, kendi hesabınla aynı platformdan olmalı." });
    await expect(repo.startOnboardingBuild(WS, { rivalIds: [ignored.id] })).rejects.toMatchObject({ code: "invalid_input" });
    expect((await repo.listJobs(WS, { active: true })).length, "reddedilen seçim iş yazmaz").toBe(0);

    const job = await repo.startOnboardingBuild(WS, { rivalIds: [candidate.id] });
    expect(job.params).toEqual({ phase: "build", rivalIds: [candidate.id] });
    expect((await repo.listCompetitors(WS, { status: "tracked" })).some((c) => c.id === candidate.id)).toBe(true);
  });
});

describe("mock başlangıç akışı: gerçekten boş hesap (D1-01)", () => {
  it("taze hesapta Bugün'ün okuduğu veri boş: içerik, ölçüm, koşu, plan, fikir, onay bekleyen yayın, bildirim yok", async () => {
    const repo = repoAt("add_account");
    expect((await repo.listContent(WS)).total).toBe(0);
    expect(await repo.listWeeklyPlans(WS)).toEqual([]);
    expect(await repo.listIdeas(WS)).toEqual([]);
    expect((await repo.listRuns(WS)).total).toBe(0);
    expect(await repo.listPublishJobs(WS, { status: "awaiting_approval" })).toEqual([]);
    expect(await repo.countUnreadNotifications(WS)).toBe(0);
    const overview = await repo.getOverview(WS, { days: 30 });
    // Bugün'ün "hiç bakılmadı" kararı (`isEmptyWorkspace`) bu üç göstergeye bakar.
    for (const key of ["followers", "views", "posts"] as const) expect(kpiOf(overview, key)?.value, key).toBeUndefined();
  });

  it("kurulu hesapta (akış kapalı) veri yerinde kalır", async () => {
    const repo = createMockRepository(undefined, { jobQueue: QUEUE });
    expect((await repo.listContent(WS)).total).toBeGreaterThan(0);
    expect(await repo.countUnreadNotifications(WS)).toBeGreaterThan(0);
  });

  it("hesaba bakış tohumun içerik sayısını söyler (boşaltılmış listeden değil); ilk inceleme bitince veri geri gelir", async () => {
    const repo = repoAt("review_account", true);
    expect((await repo.getOnboardingState(WS)).probe?.videoCount).toBeGreaterThan(0);
    await repo.confirmOnboardingAccount(WS, { accountType: "creator" });
    await repo.startOnboardingBuild(WS, { rivalIds: [] });
    expect((await repo.listContent(WS)).total, "ilk inceleme sürerken hesap boş").toBe(0);
    for (let reads = 0; reads < 20 && (await repo.getOnboardingState(WS)).step === "building"; reads++);
    expect((await repo.getOnboardingState(WS)).step).toBe("done");
    expect((await repo.listContent(WS)).total).toBeGreaterThan(0);
    expect((await repo.listWeeklyPlans(WS)).length).toBeGreaterThan(0);
  });
});

describe("mock başlangıç akışı: yoklama ucu işi ilerletir (pollAdvance; D1-12/13)", () => {
  it("yalnız iş okumasıyla (sayfa çizimi olmadan) ilk inceleme biter; adımlar geri gitmez, bitişte hepsi 'tamam'", async () => {
    const repo = repoAt("choose_rivals", true, true);
    const build = await repo.startOnboardingBuild(WS, { rivalIds: [] });
    const order = onboardingStepsOf("build");
    let lastIndex = -1;
    let job = await repo.getJob(WS, build.id);
    for (let reads = 0; reads < 30 && job?.status !== "succeeded"; reads++) {
      const index = job?.currentStep === undefined ? lastIndex : order.indexOf(job.currentStep);
      expect(index, "adım geri gitmez").toBeGreaterThanOrEqual(lastIndex);
      lastIndex = index;
      await repo.listJobs(WS, { active: true, limit: 1 });
      job = await repo.getJob(WS, build.id);
    }
    expect(job?.status).toBe("succeeded");
    expect(job?.steps.map((step) => step.status)).toEqual(order.map(() => "ok"));
    expect(await repo.listJobs(WS, { active: true, limit: 1 }), "bitince etkin iş kalmaz").toEqual([]);
  });

  it("pollAdvance kapalıyken iş okumaları işi ilerletmez", async () => {
    const repo = repoAt("choose_rivals", true, false);
    const build = await repo.startOnboardingBuild(WS, { rivalIds: [] });
    for (let reads = 0; reads < 10; reads++) await repo.listJobs(WS, { active: true, limit: 1 });
    expect((await repo.getJob(WS, build.id))?.status).toBe("queued");
  });
});
