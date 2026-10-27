import { describe, expect, it } from "vitest";

import { rivalPlatformProblem } from "@/lib/domain/competitor";
import {
  deriveOnboarding,
  isOnboardingOpen,
  ONBOARDING_ACTIONS,
  ONBOARDING_REASONS,
  ONBOARDING_STEPS,
  onboardingAttemptsLeft,
  onboardingJobFacts,
  type OnboardingFacts,
  type OnboardingJobFact,
} from "@/lib/domain/onboarding";
import { ONBOARDING_LOW_DATA_VIDEOS, ONBOARDING_PHASE_SPEC, type OnboardingPhase } from "@/lib/domain/onboarding-job";
import type { JobOutcomeCode, JobStatus, PanelJob } from "@/lib/domain/panel-job";

/** Taze hesap: eklendi, hiçbir iş yok, veri yok. */
const FRESH: OnboardingFacts = { hasAccount: true, accountConfirmed: false, probeAttempts: 0, buildAttempts: 0, candidateCount: 0, hasPlan: false, hasData: false };
const job = (status: JobStatus, outcome?: JobOutcomeCode): OnboardingJobFact => ({ id: "j", status, ...(outcome === undefined ? {} : { outcome }) });
const probed = (extra: Partial<OnboardingFacts> = {}): OnboardingFacts => ({ ...FRESH, probe: job("succeeded"), probeAttempts: 1, videoCount: 25, candidateCount: 4, ...extra });
const building = (status: JobStatus, extra: Partial<OnboardingFacts> = {}): OnboardingFacts => probed({ accountConfirmed: true, build: job(status), buildAttempts: 1, ...extra });

describe("deriveOnboarding: her adım", () => {
  it("add_account: hesap yoksa hesap ekle; hesap var ama bakış başlamadıysa bakışı başlat", () => {
    expect(deriveOnboarding({ ...FRESH, hasAccount: false })).toEqual({ step: "add_account", reason: "no_account", next: "add_account", lowData: false });
    expect(deriveOnboarding(FRESH)).toEqual({ step: "add_account", reason: "probe_not_started", next: "start_probe", lowData: false });
  });

  it("probing: bakış sırada ya da çalışıyor (beklenir, eylem yok)", () => {
    for (const status of ["queued", "running"] as const) expect(deriveOnboarding({ ...FRESH, probe: job(status), probeAttempts: 1 })).toEqual({ step: "probing", lowData: false });
  });

  it("review_account: bakış bitti, hesap onaylanmadı (kısmi biten bakış da sayılır)", () => {
    expect(deriveOnboarding(probed())).toEqual({ step: "review_account", next: "confirm_account", lowData: false });
    expect(deriveOnboarding(probed({ probe: job("partial") })).step).toBe("review_account");
  });

  it("choose_rivals: hesap onaylandı; aday yoksa rakipsiz yol açık kalır", () => {
    expect(deriveOnboarding(probed({ accountConfirmed: true }))).toEqual({ step: "choose_rivals", next: "start_build", lowData: false });
    expect(deriveOnboarding(probed({ accountConfirmed: true, candidateCount: 0 }))).toEqual({ step: "choose_rivals", reason: "no_candidates", next: "start_build", lowData: false });
  });

  it("building: ilk tur sırada ya da çalışıyor", () => {
    for (const status of ["queued", "running"] as const) expect(deriveOnboarding(building(status))).toEqual({ step: "building", lowData: false });
  });

  it("done: plan hazır; tamam ama plansız; akıştan önce kurulmuş hesap", () => {
    expect(deriveOnboarding(building("succeeded", { hasPlan: true }))).toEqual({ step: "done", reason: "plan_ready", lowData: false });
    expect(deriveOnboarding(building("succeeded")), "plan çıkmadı: yine kapanır, eylem yok").toEqual({ step: "done", reason: "plan_not_ready", lowData: false });
    expect(deriveOnboarding({ ...FRESH, hasData: true })).toEqual({ step: "done", reason: "legacy", lowData: false });
    expect(deriveOnboarding({ ...FRESH, hasPlan: true }).reason).toBe("legacy");
  });

  it("blocked (bakış): gizli, bulunamadı, videosuz, hata; çıkış yolu nedene göre", () => {
    const blocked = (outcome: JobOutcomeCode | undefined, attempts = 1, status: JobStatus = "blocked") => deriveOnboarding({ ...FRESH, probe: job(status, outcome), probeAttempts: attempts });
    expect(blocked("account_private")).toEqual({ step: "blocked", reason: "account_private", next: "start_probe", lowData: false });
    expect(blocked("no_videos")).toMatchObject({ reason: "no_videos", next: "start_probe" });
    expect(blocked("account_not_found"), "yeniden bakmak anlamsız: başka hesap ekle").toMatchObject({ reason: "account_not_found", next: "add_account" });
    expect(blocked("error", 1, "failed")).toMatchObject({ step: "blocked", reason: "probe_failed", next: "start_probe" });
    expect(blocked(undefined, 1, "cancelled")).toMatchObject({ reason: "probe_failed", next: "start_probe" });
  });
});

describe("deriveOnboarding: yarıda kalma ve geri gelme", () => {
  it("yarıda kalan ilk tur: plan yoksa durur ve onaysız sürdürme önerilir; plan varsa akış kapanır", () => {
    expect(deriveOnboarding(building("partial"))).toEqual({ step: "blocked", reason: "build_incomplete", next: "resume", lowData: false });
    expect(deriveOnboarding(building("partial", { hasPlan: true }))).toMatchObject({ step: "done", reason: "plan_ready" });
  });

  it("işçisi kaybolan / hata veren / durdurulan ilk tur: hak varsa yeniden Başlat, hak bittiyse sürdür", () => {
    for (const [status, outcome] of [["failed", "worker_lost"], ["failed", "timeout"], ["cancelled", undefined], ["blocked", "over_approved_amount"]] as const) {
      expect(deriveOnboarding(building(status, { build: job(status, outcome) })), status).toMatchObject({ step: "blocked", reason: "build_failed", next: "start_build" });
    }
    const exhausted = building("failed", { buildAttempts: ONBOARDING_PHASE_SPEC.build.attemptsMax });
    expect(deriveOnboarding(exhausted)).toMatchObject({ step: "blocked", reason: "build_failed", next: "resume" });
    expect(deriveOnboarding({ ...exhausted, hasPlan: true }), "sonradan plan çıktıysa akış kapanır").toMatchObject({ step: "done", reason: "plan_ready" });
  });

  it("bakışta deneme hakkı bitince yeniden bakış önerilmez", () => {
    const max = ONBOARDING_PHASE_SPEC.probe.attemptsMax;
    expect(deriveOnboarding({ ...FRESH, probe: job("failed", "error"), probeAttempts: max })).toMatchObject({ step: "blocked", reason: "attempts_exhausted", next: "add_account" });
    expect(deriveOnboarding({ ...FRESH, probe: job("blocked", "account_private"), probeAttempts: max })).toMatchObject({ reason: "account_private", next: "add_account" });
    expect(onboardingAttemptsLeft("probe", max - 1)).toBe(true);
    expect(onboardingAttemptsLeft("probe", max)).toBe(false);
  });

  it("kapatıp geri gelme: aynı olgular her zaman aynı adımı verir (durum saklanmaz); ilk tur işi bakış işinin önündedir", () => {
    const facts = probed({ accountConfirmed: true });
    expect(deriveOnboarding(facts)).toEqual(deriveOnboarding(structuredClone(facts)));
    // İlk tur başladıktan sonra bakış işinin durumu adımı değiştirmez.
    expect(deriveOnboarding(building("running", { probe: job("failed", "error") })).step).toBe("building");
    // Hesap onayı ilk tur başladıktan sonra da geri gelmez.
    expect(deriveOnboarding(building("running", { accountConfirmed: false })).step).toBe("building");
  });

  it("az video: akış sürer, uyarı taşınır; video sayısı bilinmiyorsa uyarı uydurulmaz", () => {
    const few = ONBOARDING_LOW_DATA_VIDEOS - 1;
    expect(deriveOnboarding(probed({ videoCount: few }))).toEqual({ step: "review_account", reason: "few_videos", next: "confirm_account", lowData: true });
    expect(deriveOnboarding(probed({ videoCount: few, accountConfirmed: true }))).toMatchObject({ step: "choose_rivals", reason: "few_videos", lowData: true });
    expect(deriveOnboarding(probed({ videoCount: few, accountConfirmed: true, candidateCount: 0 })).reason, "aday yokluğu uyarının önündedir").toBe("no_candidates");
    expect(deriveOnboarding(probed({ videoCount: ONBOARDING_LOW_DATA_VIDEOS })).lowData).toBe(false);
    expect(deriveOnboarding({ ...probed(), videoCount: undefined }).lowData).toBe(false);
  });

  it("çıktı her zaman bilinen adım / neden / eylem; akış yalnız done'da kapalı", () => {
    const samples: OnboardingFacts[] = [{ ...FRESH, hasAccount: false }, FRESH, probed(), probed({ accountConfirmed: true }), building("running"), building("succeeded"), building("partial"), { ...FRESH, hasData: true }];
    for (const facts of samples) {
      const status = deriveOnboarding(facts);
      expect(ONBOARDING_STEPS).toContain(status.step);
      if (status.reason !== undefined) expect(ONBOARDING_REASONS).toContain(status.reason);
      if (status.next !== undefined) expect(ONBOARDING_ACTIONS).toContain(status.next);
      expect(isOnboardingOpen(status)).toBe(status.step !== "done");
    }
  });
});

describe("onboardingJobFacts", () => {
  const row = (id: string, phase: OnboardingPhase | undefined, status: JobStatus, createdAt: string, result?: PanelJob["result"]): PanelJob => ({
    id,
    workspaceId: "ws",
    queue: "test",
    kind: phase === undefined ? "routine" : "onboarding",
    dryRun: false,
    params: phase === undefined ? {} : { phase },
    status,
    steps: [],
    createdAt,
    ...(result === undefined ? {} : { result }),
  });
  const profile = { platform: "instagram", handle: "ornek.hesap" } as const;

  it("aşama başına en yeni iş + deneme sayısı; başka türler ve aşamasız satır sayılmaz", () => {
    const facts = onboardingJobFacts([
      row("p1", "probe", "failed", "2026-10-01T10:00:00.000Z", { outcome: "error" }),
      row("r1", undefined, "succeeded", "2026-10-01T12:00:00.000Z"),
      row("p2", "probe", "succeeded", "2026-10-01T11:00:00.000Z", { probe: { profile, videoCount: 7 } }),
      row("b1", "build", "running", "2026-10-01T13:00:00.000Z"),
    ]);
    expect(facts).toMatchObject({ probe: { id: "p2", status: "succeeded" }, probeAttempts: 2, build: { id: "b1", status: "running" }, buildAttempts: 1, videoCount: 7 });
    expect(facts.probe?.outcome).toBeUndefined();
  });

  it("çıktı en yeni BAŞARILI bakıştan okunur; iş yoksa alan yok (0 değil)", () => {
    const facts = onboardingJobFacts([
      row("p1", "probe", "succeeded", "2026-10-01T10:00:00.000Z", { probe: { profile, videoCount: 25 } }),
      row("p2", "probe", "failed", "2026-10-01T11:00:00.000Z", { outcome: "timeout" }),
    ]);
    expect(facts.probe).toEqual({ id: "p2", status: "failed", outcome: "timeout" });
    expect(facts.probeResult).toEqual({ profile, videoCount: 25 });
    expect(onboardingJobFacts([])).toEqual({ probeAttempts: 0, buildAttempts: 0 });
  });
});

describe("rivalPlatformProblem (kural: rakip, kendi hesapla AYNI platformdan)", () => {
  it("aynı platform geçer; başka platform ve hesapsız çalışma alanı reddedilir", () => {
    expect(rivalPlatformProblem(["instagram"], "instagram")).toBeUndefined();
    expect(rivalPlatformProblem(["instagram", "tiktok"], "tiktok")).toBeUndefined();
    expect(rivalPlatformProblem(["instagram"], "tiktok")).toBe("Rakip, kendi hesabınla aynı platformdan olmalı.");
    expect(rivalPlatformProblem([], "instagram")).toMatch(/Önce kendi hesabını ekle/);
  });
});
