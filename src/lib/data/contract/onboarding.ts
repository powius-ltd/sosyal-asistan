/**
 * Sözleşme: başlangıç akışı (`OnboardingRepository`; plan `docs/BASLANGIC-AKISI-PLAN.md` §2). Durum saklanmaz: adım iş satırlarından ve
 * veriden türetilir. Kurulu (seed'li) çalışma alanı akışa girmez (`done` + `legacy`); akışın tamamı TAZE çalışma alanında sınanır
 * (`RepositoryContractOptions.freshWorkspace`: yalnız kendi hesap; içerik, rakip, plan, iş yok). İşi almak / bitirmek işçinin işidir
 * (`jobWorker`); gerçek koşu AÇILMAZ: işler test kuyruğuna yazılır, hiçbir sağlayıcı çağrılmaz.
 */
import { expect, it } from "vitest";

import { ignoreCompetitors, expectCode, type ContractContext } from "@/lib/data/contract/support";
import { jobParamsSchema } from "@/lib/data/job-schema";
import { ONBOARDING_ACTIONS, ONBOARDING_REASONS, ONBOARDING_STEPS, type OnboardingState } from "@/lib/domain/onboarding";
import { ONBOARDING_PHASE_SPEC, ONBOARDING_RIVALS_MAX } from "@/lib/domain/onboarding-job";
import { PLATFORMS } from "@/lib/domain/platform";

function expectStateShape(state: OnboardingState) {
  expect(ONBOARDING_STEPS).toContain(state.step);
  if (state.reason !== undefined) expect(ONBOARDING_REASONS).toContain(state.reason);
  if (state.next !== undefined) expect(ONBOARDING_ACTIONS).toContain(state.next);
  expect(Number.isInteger(state.candidateCount) && state.candidateCount >= 0).toBe(true);
  expect(Number.isInteger(state.trackedCount) && state.trackedCount >= 0).toBe(true);
  for (const phase of ["probe", "build"] as const) {
    expect(state.attemptsLeft[phase]).toBeGreaterThanOrEqual(0);
    expect(state.attemptsLeft[phase]).toBeLessThanOrEqual(ONBOARDING_PHASE_SPEC[phase].attemptsMax);
  }
  expect(JSON.parse(JSON.stringify(state)), "serileştirilebilir").toEqual(state);
}

export function onboardingContract({ wsId, foreign, create, freshWorkspace, jobWorker }: ContractContext): void {
  it("başlangıç: kurulu hesap akışa girmez (done + legacy), akış eylemleri invalid_state; bilinmeyen workspace not_found", async () => {
    const r = create();
    const state = await r.getOnboardingState(wsId);
    expectStateShape(state);
    expect(state).toMatchObject({ step: "done", reason: "legacy" });
    expect(state.next).toBeUndefined();
    expect(state.account, "kendi hesap özeti").toMatchObject({ handle: expect.any(String), platform: expect.any(String) });
    expect(state.activeJobId).toBeUndefined();
    await expectCode(r.startOnboardingProbe(wsId), "invalid_state");
    await expectCode(r.confirmOnboardingAccount(wsId, { accountType: "creator" }), "invalid_state");
    await expectCode(r.startOnboardingBuild(wsId), "invalid_state");
    await expectCode(r.addOnboardingRival(wsId, { handle: "erken.hesap" }), "invalid_state");
    expect((await r.listJobs(wsId, { active: true })).filter((job) => job.kind === "onboarding"), "reddedilen eylem iş yazmaz").toEqual([]);

    await expectCode(r.getOnboardingState(foreign), "not_found");
    await expectCode(r.startOnboardingProbe(foreign), "not_found");
    await expectCode(r.confirmOnboardingAccount(foreign, { accountType: "creator" }), "not_found");
    await expectCode(r.startOnboardingBuild(foreign), "not_found");
    await expectCode(r.addOnboardingRival(foreign, { handle: "x.y" }), "not_found");
  });

  it("başlangıç: kurulu (gerçek veri taşıyan) çalışma alanı 'yanlış hesap' diye kaldırılamaz; bilinmeyen workspace not_found", async () => {
    const r = create();
    await expectCode(r.discardOnboardingWorkspace(wsId), "invalid_state");
    expect(await r.getWorkspace(wsId), "reddedilen kaldırma hiçbir şey silmedi").toBeTruthy();
    expect((await r.getOnboardingState(wsId)).step).toBe("done");
    await expectCode(r.discardOnboardingWorkspace(foreign), "not_found");
  });

  it("başlangıç akışı (taze hesap): bakış → onay → rakip seçimi → Başlat → kapanış; onay sunucuda, hesap başına tek ilk tur, onaysız izleme yok", async () => {
    const { repo: r, wsId: fresh } = await freshWorkspace();
    const added: string[] = [];
    try {
      // 1) Hesap ekli, bakış başlamadı.
      const start = await r.getOnboardingState(fresh);
      expectStateShape(start);
      expect(start).toMatchObject({ step: "add_account", reason: "probe_not_started", next: "start_probe", lowData: false });
      expect(start.attemptsLeft).toEqual({ probe: ONBOARDING_PHASE_SPEC.probe.attemptsMax, build: ONBOARDING_PHASE_SPEC.build.attemptsMax });
      const account = start.account;
      if (account === undefined) throw new Error("taze çalışma alanında kendi hesap olmalı");
      await expectCode(r.confirmOnboardingAccount(fresh, { accountType: "creator" }), "invalid_state");
      await expectCode(r.startOnboardingBuild(fresh), "invalid_state");
      await expectCode(r.addOnboardingRival(fresh, { handle: "erken.hesap" }), "invalid_state"); // akış henüz rakip seçimini beklemiyor
      // Bakış bitmeden ilk tur işi doğrudan da yazılamaz (DB kuralı / mock aynı kural).
      await expectCode(r.requestJob(fresh, { kind: "onboarding", phase: "build" }), "invalid_state");

      // 2) Hesaba bakış: onay sunucuda, aşamanın sabit tavanı.
      const probe = await r.startOnboardingProbe(fresh);
      expect(probe).toMatchObject({ kind: "onboarding", status: "queued", dryRun: false, params: { phase: "probe" }, workspaceId: fresh });
      expect(probe.approval).toMatchObject({ basis: "onboarding", maxUsd: ONBOARDING_PHASE_SPEC.probe.maxUsd });
      expect(jobParamsSchema.safeParse(probe.params).success).toBe(true);
      const probing = await r.getOnboardingState(fresh);
      expect(probing).toMatchObject({ step: "probing", activeJobId: probe.id });
      expect(probing.next).toBeUndefined();
      await expectCode(r.startOnboardingProbe(fresh), "invalid_state");
      expect(await jobWorker.claim(r), "test kuyruğundaki tek iş").toBe(probe.id);
      await jobWorker.finish(r, probe.id);

      // 3) "Bu sen misin?": tür kullanıcı kararıdır; konu isteğe bağlı.
      const review = await r.getOnboardingState(fresh);
      expectStateShape(review);
      expect(review).toMatchObject({ step: "review_account", next: "confirm_account" });
      expect(review.attemptsLeft.probe).toBe(ONBOARDING_PHASE_SPEC.probe.attemptsMax - 1);
      expect(review.accountConfirmedAt).toBeUndefined();
      await expectCode(r.startOnboardingBuild(fresh), "invalid_state");
      await expectCode(r.confirmOnboardingAccount(fresh, { accountType: "agency" as never }), "invalid_input");
      const confirmed = await r.confirmOnboardingAccount(fresh, { accountType: "creator", nicheBrief: "  Sözleşme testi konusu  " });
      expect(confirmed).toMatchObject({ step: "choose_rivals", next: "start_build", accountType: "creator", nicheBrief: "Sözleşme testi konusu" });
      expect(Date.parse(confirmed.accountConfirmedAt ?? "")).not.toBeNaN();
      await expectCode(r.discardOnboardingWorkspace(fresh), "invalid_state"); // onaylanmış hesap kaldırılamaz
      expect((await r.getWorkspace(fresh))?.accountType).toBe("creator");
      // Onay ilk tur başlayana kadar yinelenebilir; konu verilmezse dokunulmaz.
      expect(await r.confirmOnboardingAccount(fresh, { accountType: "mixed" })).toMatchObject({ step: "choose_rivals", accountType: "mixed", nicheBrief: "Sözleşme testi konusu" });

      // 4) Rakipler: aday eklenir (izlenmez); rakip kendi hesapla AYNI platformdan olmalı.
      const ownPlatforms = (await r.listOwnAccounts(fresh)).map((own) => own.platform);
      const otherPlatform = PLATFORMS.find((platform) => !ownPlatforms.includes(platform));
      if (otherPlatform !== undefined) await expectCode(r.addCompetitor(fresh, { platform: otherPlatform, handle: "baska.platform", status: "candidate" }), "invalid_input");
      const handle = `aday.${Date.now().toString(36)}`;
      const candidate = await r.addCompetitor(fresh, { platform: account.platform, handle, status: "candidate", source: "search" });
      added.push(candidate.id);
      const choosing = await r.getOnboardingState(fresh);
      expect(choosing.step).toBe("choose_rivals");
      expect(choosing.candidateCount).toBeGreaterThanOrEqual(1);
      expect(choosing.reason).not.toBe("no_candidates");

      // Elle eklenen aday: yalnız aday satırı yazılır, Apify rezervi (koşu satırı) YOK; platform girdiden gelmez.
      const runsBefore = (await r.listRuns(fresh, { limit: 200 })).items.length;
      const manualHandle = `elle.${Date.now().toString(36)}`;
      const manual = await r.addOnboardingRival(fresh, { handle: `@${manualHandle.toUpperCase()}` });
      added.push(manual.id);
      expect(manual).toMatchObject({ status: "candidate", source: "manual", platform: account.platform, handle: manualHandle });
      expect((await r.listRuns(fresh, { limit: 200 })).items.length, "aday eklemek bütçe rezervi / koşu yazmaz").toBe(runsBefore);
      expect((await r.listCompetitors(fresh, { status: "tracked" })).some((c) => c.id === manual.id), "aday izlemeye alınmadı").toBe(false);
      await expectCode(r.addOnboardingRival(fresh, { handle: manualHandle }), "already_exists");
      await expectCode(r.addOnboardingRival(fresh, { handle: "geçersiz ad!" }), "invalid_input");
      await expectCode(r.addOnboardingRival(fresh, { handle: "baska.platform", platform: "tiktok" } as never), "invalid_input");

      // Geçersiz seçim: hiçbir iş yazılmaz, hiçbir rakip izlemeye alınmaz.
      await expectCode(r.startOnboardingBuild(fresh, { rivalIds: ["00000000-0000-4000-8000-00000000abcd"] }), "invalid_input");
      await expectCode(r.startOnboardingBuild(fresh, { rivalIds: Array.from({ length: ONBOARDING_RIVALS_MAX + 1 }, (_, index) => `x${index}`) }), "invalid_input");
      expect((await r.listCompetitors(fresh, { status: "candidate" })).some((c) => c.id === candidate.id), "aday hâlâ aday").toBe(true);
      expect((await r.getOnboardingState(fresh)).step).toBe("choose_rivals");

      // 5) "Başlat": rakip izlemeye alınır + ilk tur sıraya yazılır (sabit tavanlı onay).
      const build = await r.startOnboardingBuild(fresh, { rivalIds: [candidate.id] });
      expect(build).toMatchObject({ kind: "onboarding", status: "queued", params: { phase: "build", rivalIds: [candidate.id] } });
      expect(build.approval).toMatchObject({ basis: "onboarding", maxUsd: ONBOARDING_PHASE_SPEC.build.maxUsd });
      expect((await r.listCompetitors(fresh, { status: "tracked" })).some((c) => c.id === candidate.id), "seçilen rakip izleniyor").toBe(true);
      const building = await r.getOnboardingState(fresh);
      expect(building).toMatchObject({ step: "building", activeJobId: build.id });
      expect(building.trackedCount).toBeGreaterThanOrEqual(1);
      await expectCode(r.startOnboardingBuild(fresh), "invalid_state");
      await expectCode(r.confirmOnboardingAccount(fresh, { accountType: "creator" }), "invalid_state");
      expect(await jobWorker.claim(r)).toBe(build.id);
      await jobWorker.finish(r, build.id);

      // 6) Kapanış: akış biter; ilk tur hesap başına BİR KEZ (doğrudan iş isteğiyle de açılamaz).
      const done = await r.getOnboardingState(fresh);
      expectStateShape(done);
      expect(done.step).toBe("done");
      expect(["plan_ready", "plan_not_ready"]).toContain(done.reason);
      expect(done.activeJobId).toBeUndefined();
      await expectCode(r.startOnboardingBuild(fresh), "invalid_state");
      await expectCode(r.startOnboardingProbe(fresh), "invalid_state");
      await expectCode(r.requestJob(fresh, { kind: "onboarding", phase: "build" }), "already_exists");
    } finally {
      for (const job of await r.listJobs(fresh, { active: true })) await r.cancelJob(fresh, job.id).catch(() => undefined);
      await ignoreCompetitors(r, fresh, added);
    }
  });
}
