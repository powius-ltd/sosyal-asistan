/**
 * Başlangıç akışının DURUMU (plan `docs/BASLANGIC-AKISI-PLAN.md` §2). Durum SAKLANMAZ: iş satırlarından (`onboarding` `probe` / `build`),
 * hesap onayından (`workspaces.account_confirmed_at`) ve veriden TÜRETİLİR; sayfayı kapatıp gelen kullanıcı kaldığı ekrana düşer.
 * Saf dosya (sunucu + istemci): depo uygulamaları (mock, Supabase) olguları toplar, adımı AYNI fonksiyon (`deriveOnboarding`) verir.
 * İşin kendisi (aşamalar, tavanlar, deneme sınırları) `onboarding-job.ts`'te.
 */
import type { AccountType } from "@/lib/domain/account-type";
import type { OwnAccount } from "@/lib/domain/competitor";
import { ONBOARDING_LOW_DATA_VIDEOS, ONBOARDING_PHASE_SPEC, onboardingPhaseOf, type OnboardingPhase, type OnboardingProbeResult } from "@/lib/domain/onboarding-job";
import { isActiveJobStatus, type JobOutcomeCode, type JobStatus, type PanelJob } from "@/lib/domain/panel-job";

/**
 * add_account: hesap yok ya da hesaba bakış hiç başlamadı · probing: hesaba bakılıyor · review_account: "bu sen misin?" + tür + konu ·
 * choose_rivals: rakip önerisi + "Başlat" · building: ilk tur sürüyor · done: akış kapandı (plan hazır, plan çıkmadı ya da akıştan önce
 * kurulmuş hesap) · blocked: akış durdu (`reason` nedenini, `next` çıkış yolunu söyler).
 */
export const ONBOARDING_STEPS = ["add_account", "probing", "review_account", "choose_rivals", "building", "done", "blocked"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_REASONS = [
  "no_account", // add_account: çalışma alanında kendi hesap yok
  "probe_not_started", // add_account: hesap ekli ama hesaba bakış hiç başlatılmadı
  "few_videos", // review_account / choose_rivals: az video, sonuçlar düşük güvenli (uyarı; akış sürer)
  "no_candidates", // choose_rivals: rakip adayı bulunamadı (rakipsiz yol açık)
  "plan_ready", // done: ilk plan hazır
  "plan_not_ready", // done: videolar incelendi ama plan çıkmadı
  "legacy", // done: hesap bu akıştan önce kurulmuş, verisi var
  "account_private", // blocked: hesap gizli
  "account_not_found", // blocked: hesap bulunamadı
  "no_videos", // blocked: hesapta video yok
  "probe_failed", // blocked: hesaba bakış tamamlanamadı (hata, iptal, süre)
  "build_failed", // blocked: ilk tur başlamadan / hiçbir şey üretmeden bitti
  "build_incomplete", // blocked: ilk tur yarıda kaldı, yapılan duruyor
  "attempts_exhausted", // blocked: deneme hakkı bitti
] as const;
export type OnboardingReason = (typeof ONBOARDING_REASONS)[number];

/**
 * Kullanıcıyı ilerleten eylem: add_account = hesap ekle (çalışma alanı aç + bakışı başlat) · start_probe = hesaba bakışı (yeniden) başlat ·
 * confirm_account = hesabı / türü / konuyu onayla · start_build = rakipleri seç ve "Başlat" · resume = kalan işi onaysız haftalık turla
 * ($0) sürdür. Eylem yoksa (`next` undefined) beklenir (iş sürüyor) ya da yapılacak bir şey kalmamıştır.
 */
export const ONBOARDING_ACTIONS = ["add_account", "start_probe", "confirm_account", "start_build", "resume"] as const;
export type OnboardingAction = (typeof ONBOARDING_ACTIONS)[number];

export type OnboardingStatus = {
  step: OnboardingStep;
  reason?: OnboardingReason;
  next?: OnboardingAction;
  /** Hesapta `ONBOARDING_LOW_DATA_VIDEOS`'tan az video bulundu: sonuçlar düşük güvenli (bilinmiyorsa false). */
  lowData: boolean;
};

/** Türetmenin baktığı iş özeti (aşamanın EN YENİ işi). */
export type OnboardingJobFact = {
  id: string;
  status: JobStatus;
  outcome?: JobOutcomeCode;
};

/** Türetmenin girdisi: yalnız olgular (durum alanı yok). */
export interface OnboardingFacts {
  /** Çalışma alanında kendi hesap var mı. */
  hasAccount: boolean;
  /** Kullanıcı hesabı ve türü onayladı mı (`account_confirmed_at` dolu). */
  accountConfirmed: boolean;
  probe?: OnboardingJobFact;
  /** `probe` iş satırı sayısı (iptal / hata dahil). */
  probeAttempts: number;
  build?: OnboardingJobFact;
  buildAttempts: number;
  /** `probe`'un bulduğu kısa video sayısı; bilinmiyorsa undefined (0 değil). */
  videoCount?: number;
  /** Aday (`candidate`) rakip sayısı. */
  candidateCount: number;
  /** Haftalık plan var mı. */
  hasPlan: boolean;
  /** Akıştan bağımsız veri var mı (toplanmış içerik ya da izlenen rakip): akıştan önce kurulmuş hesabı ayırır. */
  hasData: boolean;
}

const PROBE_BLOCKERS = ["account_private", "account_not_found", "no_videos"] as const satisfies readonly JobOutcomeCode[];
type ProbeBlocker = (typeof PROBE_BLOCKERS)[number];
const probeBlocker = (outcome: JobOutcomeCode | undefined): ProbeBlocker | undefined => PROBE_BLOCKERS.find((code) => code === outcome);

/** Aşamanın deneme hakkı kaldı mı (DB trigger'ı ile aynı sınır). */
export function onboardingAttemptsLeft(phase: OnboardingPhase, attempts: number): boolean {
  return attempts < ONBOARDING_PHASE_SPEC[phase].attemptsMax;
}

/** İş listesinden (herhangi bir sırada) aşama başına EN YENİ iş + deneme sayıları + `probe` çıktısı. `onboarding` dışı işler yok sayılır. */
export function onboardingJobFacts(jobs: readonly PanelJob[]): Pick<OnboardingFacts, "probe" | "probeAttempts" | "build" | "buildAttempts" | "videoCount"> & { probeResult?: OnboardingProbeResult } {
  const newestFirst = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const of = (phase: OnboardingPhase) => newestFirst.filter((job) => onboardingPhaseOf(job) === phase);
  const fact = (job: PanelJob | undefined): OnboardingJobFact | undefined =>
    job === undefined ? undefined : { id: job.id, status: job.status, ...(job.result?.outcome === undefined ? {} : { outcome: job.result.outcome }) };
  const [probes, builds] = [of("probe"), of("build")];
  // Çıktı en yeni BAŞARILI bakıştan okunur (sonraki bir deneme hata verse de ekran profili gösterebilsin).
  const probeResult = probes.find((job) => job.result?.probe !== undefined)?.result?.probe;
  return {
    ...(probes[0] === undefined ? {} : { probe: fact(probes[0]) }),
    probeAttempts: probes.length,
    ...(builds[0] === undefined ? {} : { build: fact(builds[0]) }),
    buildAttempts: builds.length,
    ...(probeResult?.videoCount === undefined ? {} : { videoCount: probeResult.videoCount }),
    ...(probeResult === undefined ? {} : { probeResult }),
  };
}

/**
 * Akışın adımı (saf, deterministik). Öncelik: hesap yok → ilk tur işi → bakış işi → işsiz hesap. Kurallar:
 *  - ilk tur etkinse `building`; bittiyse plan varsa `done`; tamam ama plan yoksa `done` + `plan_not_ready`; kısmi ve plansızsa `blocked` +
 *    `build_incomplete` (sürdür); hata / iptal / engelse `blocked` + `build_failed` (hak varsa yeniden "Başlat", yoksa sürdür);
 *  - bakış etkinse `probing`; bittiyse onay yoksa `review_account`, varsa `choose_rivals`; durduysa `blocked` (gizli, yok, videosuz, hata);
 *  - hiç başlangıç işi yoksa: verisi olan hesap `done` + `legacy` (akış ona dayatılmaz), boş hesap `add_account` + `probe_not_started`.
 */
export function deriveOnboarding(facts: OnboardingFacts): OnboardingStatus {
  const lowData = facts.videoCount !== undefined && facts.videoCount < ONBOARDING_LOW_DATA_VIDEOS;
  const status = (step: OnboardingStep, reason?: OnboardingReason, next?: OnboardingAction): OnboardingStatus => ({
    step,
    ...(reason === undefined ? {} : { reason }),
    ...(next === undefined ? {} : { next }),
    lowData,
  });
  if (!facts.hasAccount) return status("add_account", "no_account", "add_account");

  const { build, probe } = facts;
  if (build !== undefined) {
    if (isActiveJobStatus(build.status)) return status("building");
    if (facts.hasPlan) return status("done", "plan_ready");
    if (build.status === "succeeded") return status("done", "plan_not_ready");
    if (build.status === "partial") return status("blocked", "build_incomplete", "resume");
    return status("blocked", "build_failed", onboardingAttemptsLeft("build", facts.buildAttempts) ? "start_build" : "resume");
  }

  if (probe !== undefined) {
    if (isActiveJobStatus(probe.status)) return status("probing");
    if (probe.status === "succeeded" || probe.status === "partial") {
      if (!facts.accountConfirmed) return status("review_account", lowData ? "few_videos" : undefined, "confirm_account");
      return status("choose_rivals", facts.candidateCount === 0 ? "no_candidates" : lowData ? "few_videos" : undefined, "start_build");
    }
    const blocker = probeBlocker(probe.outcome);
    // Bulunamayan hesapta yeniden bakmanın anlamı yok (kullanıcı adı çalışma alanına bağlıdır): çıkış yolu başka hesap eklemektir.
    if (blocker === "account_not_found") return status("blocked", blocker, "add_account");
    if (!onboardingAttemptsLeft("probe", facts.probeAttempts)) return status("blocked", blocker ?? "attempts_exhausted", "add_account");
    return status("blocked", blocker ?? "probe_failed", "start_probe");
  }

  if (facts.hasData || facts.hasPlan) return status("done", "legacy");
  return status("add_account", "probe_not_started", "start_probe");
}

/** Akış açık mı (Bugün'de başlangıç kartı çizilsin mi): `done` dışındaki her adım. */
export function isOnboardingOpen(status: Pick<OnboardingStatus, "step">): boolean {
  return status.step !== "done";
}

// ------------------------------------------------------------ Ekran modeli

/** Akıştaki kendi hesap (çalışma alanının İLK kendi hesabı; bir hesap tek platforma aittir, rakipleri AYNI platformdan olur). */
export type OnboardingAccount = Pick<OwnAccount, "id" | "platform" | "handle" | "displayName" | "followers" | "connection">;

/**
 * `PanelRepository.getOnboardingState`'in döndürdüğü ekran modeli: adım + ekranın ihtiyacı. İşin ilerlemesi (adım listesi, sayaç) buradan
 * DEĞİL durum ucundan (`GET /api/isler`) okunur; `activeJobId` oradaki işi gösterir. Aday satırları `listDiscoveryCandidates`'ten gelir.
 */
export type OnboardingState = OnboardingStatus & {
  account?: OnboardingAccount;
  /** Çalışma alanının şu anki türü (onaylanana kadar varsayılan); ekranın ön seçimi `probe.suggestedAccountType ?? accountType`. */
  accountType: AccountType;
  /** Kayıtlı konu tanımı (kullanıcı yazdıysa); taslak `probe.nicheDraft`'tadır. */
  nicheBrief?: string;
  /** Hesap / tür onayının anı (ISO). */
  accountConfirmedAt?: string;
  /** En yeni başarılı bakışın çıktısı (profil özeti, video sayısı, aday özeti, tür ön seçimi, konu taslağı). */
  probe?: OnboardingProbeResult;
  /** Sırada / çalışan başlangıç işi (`probing` / `building`). */
  activeJobId?: string;
  /** Aday ve izlenen rakip sayıları. */
  candidateCount: number;
  trackedCount: number;
  /** Aşama başına kalan deneme hakkı (0 = yeniden başlatılamaz). */
  attemptsLeft: Record<OnboardingPhase, number>;
};
