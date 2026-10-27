/**
 * Başlangıç işi · `probe` ("hesaba bakış"): `verify → collect → discover → draft_niche`, çıktı `result.probe`.
 *
 *  1. verify: kendi hesabın profiline tek bakış. Gizli → `account_private`, yok → `account_not_found`: iş DURUR, içerik koşusu açılmaz.
 *  2. collect: kendi son `ONBOARDING_COLLECT_LIMIT` videosu (yalnız kendi hesap). 0 video → `no_videos` (iş durur); azsa `few_videos` (sürer).
 *  3. discover: rakip adayları (`discoverCandidates`); adaylar `candidate` yazılır, izlemeye alınmaz. Hatası işi düşürmez (iş `partial`).
 *  4. draft_niche: tek hafif yazı çağrısıyla konu taslağı; çıkarılamazsa taslak yoktur, iş düşmez.
 *
 * HARCAMA: tavan YALNIZ satırdaki onaydır (`run.maxUsd`); her ücretli adıma KALAN tutar verilir, toplam tavanı aşamaz. Adımlar mutabakat
 * beklemez (hız); gerçek tutar iş sonunda bir kez kesinleştirilir (`settleSpend`). KREDİ: bir hesaba bakış (`account_scan`); sığmıyorsa iş
 * hiç başlamaz. Durma (iptal / süre tavanı) adım sınırında sorulur.
 */
import "server-only";

import type { AccountVerification } from "@/lib/collection/discover-account";
import type { NormalizedProfile } from "@/lib/platforms/types";
import { onboardingProbeResultSchema } from "@/lib/data/job-schema";
import type { AccountType } from "@/lib/domain/account-type";
import { ONBOARDING_BIO_MAX_CHARS, ONBOARDING_COLLECT_LIMIT, onboardingStepsOf, type OnboardingCandidateSummary, type OnboardingProbeResult } from "@/lib/domain/onboarding-job";
import type { JobResult } from "@/lib/domain/panel-job";
import { scannedAccounts } from "@/lib/job-runner/credit-units";
import type { JobFinal } from "@/lib/job-runner/job-session";
import { discoverVerdict, probeCollectVerdict, verifyVerdict, type JobVerdict } from "@/lib/job-runner/outcome-map";
import { closeStep, errorMessage, runStep, skipRemaining, spendBudget, type OnboardingRun } from "@/lib/job-runner/run-onboarding-steps";
import { creditShortNote, cutFinal, withCreditVerdict } from "@/lib/job-runner/run-single";
import { truncateText } from "@/lib/text";

const DISPLAY_NAME_MAX = 150;

/** Profilden tür ÖN SEÇİMİ (yalnız öneri; tür ataması kullanıcı kararıdır): işletme işareti varsa işletme, açıkça yoksa içerik üreticisi. */
export function suggestAccountType(profile: Pick<NormalizedProfile, "isBusinessAccount">): AccountType | undefined {
  return profile.isBusinessAccount === undefined ? undefined : profile.isBusinessAccount ? "business" : "creator";
}

/** `result.probe`: şemaya uygun, sınırları aşmayan çıktı. Fotoğraf adresi ve ilgili hesaplar TAŞINMAZ. Şemadan geçmezse yalnız kimlik kalır. */
export function probeResultOf(input: { profile: NormalizedProfile; videoCount?: number; candidates?: OnboardingCandidateSummary; nicheDraft?: string }): OnboardingProbeResult {
  const { profile } = input;
  const text = (value: string | undefined, max: number): string | undefined => {
    const clipped = value === undefined ? "" : truncateText(value, max);
    return clipped === "" ? undefined : clipped;
  };
  const displayName = text(profile.displayName, DISPLAY_NAME_MAX);
  const bio = text(profile.bio, ONBOARDING_BIO_MAX_CHARS);
  const suggested = suggestAccountType(profile);
  const identity = { platform: profile.platform, handle: profile.handle };
  const full: OnboardingProbeResult = {
    profile: {
      ...identity,
      ...(displayName === undefined ? {} : { displayName }),
      ...(bio === undefined ? {} : { bio }),
      ...(profile.followers === undefined ? {} : { followers: profile.followers }),
      ...(profile.postsCount === undefined ? {} : { postsCount: profile.postsCount }),
      ...(profile.isVerified === undefined ? {} : { isVerified: profile.isVerified }),
    },
    ...(input.videoCount === undefined ? {} : { videoCount: input.videoCount }),
    ...(input.candidates === undefined ? {} : { candidates: input.candidates }),
    ...(suggested === undefined ? {} : { suggestedAccountType: suggested }),
    ...(input.nicheDraft === undefined || input.nicheDraft.trim() === "" ? {} : { nicheDraft: input.nicheDraft.trim() }),
  };
  const parsed = onboardingProbeResultSchema.safeParse(full);
  return parsed.success ? parsed.data : { profile: identity };
}

export async function runOnboardingProbe(run: OnboardingRun): Promise<JobFinal> {
  const { job, ctx, session, deps, meter } = run;
  const log = session.log;
  const steps = onboardingStepsOf("probe");
  const budget = spendBudget(run.maxUsd);
  await session.setSteps(steps.map((id) => ({ id, status: "pending" })));

  // Kredi kapısı: tek hesaba bakış ayrılan krediye sığmıyorsa hiçbir ücretli çağrı yapılmaz.
  if (meter.bound && !meter.canAfford("account_scan")) {
    const note = creditShortNote(meter, "bir hesaba bakılacak");
    log(note);
    await closeStep(session, "verify", { status: "needs_approval", code: "insufficient_credits", note });
    await skipRemaining(session, steps, "Kredi yetmediği için koşmadı.");
    return { status: "blocked", result: { outcome: "insufficient_credits" } };
  }

  /** İşi durduran hükümde: kalan adımlar atlanır, harcama özeti sonuca eklenir. */
  const stop = async (final: JobFinal, why: string, probe?: OnboardingProbeResult): Promise<JobFinal> => {
    await skipRemaining(session, steps, why);
    const spend = await settle();
    return { ...final, result: { ...final.result, ...(spend === undefined ? {} : { spend }), ...(probe === undefined ? {} : { probe }) } };
  };
  const settle = async (): Promise<JobResult["spend"]> => {
    try {
      const spend = await deps.settleSpend(ctx, job.id, { log, shouldStop: () => session.shouldStop() });
      const reservedUsd = spend.reservedUsd ?? budget.reserved();
      return { reservedUsd, ...(spend.actualUsd === undefined ? {} : { actualUsd: spend.actualUsd }) };
    } catch (error) {
      log(`Uyarı: harcama özeti alınamadı: ${errorMessage(error)}`);
      return budget.reserved() > 0 ? { reservedUsd: budget.reserved() } : undefined;
    }
  };

  /** Adımların bıraktığı sonuçlar (adım gövdesi yazar, akış okur). */
  const got: { verification?: AccountVerification; verify?: JobVerdict; collect?: ReturnType<typeof probeCollectVerdict>; candidates?: OnboardingCandidateSummary; nicheDraft?: string } = {};

  // 1 · Hesabı doğrula.
  const verifyStep = await runStep(run, "verify", async () => {
    got.verification = await deps.verifyAccount({ client: ctx.client, workspaceId: ctx.workspaceId, maxUsd: budget.remaining(), now: ctx.now, log });
    budget.add(got.verification.reservedUsd);
    got.verify = verifyVerdict(got.verification);
    return got.verify.step;
  });
  if (verifyStep === undefined) return cutFinal(session);
  const profile = got.verification?.outcome === "ok" ? got.verification.profile : undefined;
  if (profile === undefined) {
    const final: JobFinal = got.verify !== undefined && got.verify.final.status !== "succeeded" ? got.verify.final : { status: "failed", result: { outcome: "step_failed" }, error: verifyStep.note };
    return stop(final, "Hesap doğrulanamadı: adım koşmadı.");
  }

  // 2 · Kendi son videoları (yalnız kendi hesap; mutabakat iş sonunda).
  const collectStep = await runStep(run, "collect", async () => {
    const summary = await deps.collect({ workspaceId: ctx.workspaceId, ownOnly: true, limit: ONBOARDING_COLLECT_LIMIT, maxUsd: budget.remaining(), now: ctx.now, reconcileWaitMs: 0, log });
    budget.add(summary.cost.reservedUsd);
    meter.add("account_scan", scannedAccounts(summary));
    got.collect = probeCollectVerdict(summary);
    return got.collect.step;
  });
  if (collectStep === undefined) return cutFinal(session);
  const collect = got.collect;
  if (collect === undefined || collect.final.status !== "succeeded") {
    const final: JobFinal = collect?.final ?? { status: "failed", result: { outcome: "step_failed" }, error: collectStep.note };
    // Videosuz hesapta profil özeti yine yazılır (ekran hesabı gösterebilsin); gizli / hatalı toplamada yazılmaz.
    const probe = collect?.videoCount === undefined ? undefined : probeResultOf({ profile, videoCount: collect.videoCount });
    return stop(final, "Videolar alınamadı: adım koşmadı.", probe);
  }

  // 3 · Rakip adayları (hata işi düşürmez).
  const discoverStep = await runStep(run, "discover", async () => {
    const summary = await deps.discover({ client: ctx.client, workspaceId: ctx.workspaceId, maxUsd: budget.remaining(), now: ctx.now, log });
    budget.add(summary.cost.reservedUsd);
    if (summary.outcome === "completed") got.candidates = summary.candidates;
    return discoverVerdict(summary);
  });
  if (discoverStep === undefined) return cutFinal(session);

  // 4 · Konu taslağı (çıkarılamazsa boş geçilir).
  const draftStep = await runStep(run, "draft_niche", async () => {
    const result = await deps.draftNiche(ctx, { displayName: profile.displayName, bio: profile.bio, category: profile.category }, log);
    got.nicheDraft = result.draft;
    if (result.draft !== undefined) return { status: "ok", note: "Konu taslağı hazır (kullanıcı düzeltir)." };
    return { status: "skipped", note: result.note ?? "Konu taslağı çıkarılamadı: boş bırakıldı.", ...(result.persistent ? { code: "llm_unavailable" as const } : {}) };
  });
  if (draftStep === undefined) return cutFinal(session);

  const spend = await settle();
  const probe = probeResultOf({ profile, videoCount: collect.videoCount, candidates: got.candidates, nicheDraft: got.nicheDraft });
  const result: JobResult = { ...collect.final.result, ...(spend === undefined ? {} : { spend }), probe };
  // Keşif düştüyse bakış "kısmi" biter (akış yine sürer: adaysız / rakipsiz yol geçerlidir).
  const final: JobFinal = discoverStep.status === "failed" ? { status: "partial", result: { ...result, outcome: "step_failed" } } : { status: "succeeded", result };
  return withCreditVerdict(final, meter);
}
