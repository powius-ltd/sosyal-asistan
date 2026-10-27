/**
 * Başlangıç akışının depo görünümü ve korumaları — mock ve Supabase deposunun ORTAK hesabı (`lib/data/views` deseni; mock'a bağlı değil).
 * Depo uygulaması yalnız olguları toplar (`OnboardingInputs`); adım (`deriveOnboarding`), ekran modeli ve "bu eylem şu an yapılabilir mi"
 * kuralı buradadır. DB kuralları (migration 0021: deneme sınırı, bakış bitmeden ilk tur yok, tek ilk tur) aynı kuralların ikinci
 * savunma hattıdır; mock aynı kuralı `onboardingRequestProblem` ile uygular.
 */
import { RepositoryError, type RepositoryErrorCode } from "@/lib/data/repository";
import { HANDLE_PATTERN, rivalPlatformProblem, type Competitor, type OwnAccount } from "@/lib/domain/competitor";
import { deriveOnboarding, onboardingJobFacts, type OnboardingAction, type OnboardingState } from "@/lib/domain/onboarding";
import { ONBOARDING_PHASE_SPEC, onboardingPhaseOf, type OnboardingPhase } from "@/lib/domain/onboarding-job";
import { isActiveJob, type PanelJob } from "@/lib/domain/panel-job";
import type { Workspace } from "@/lib/domain/run";
import type { Platform } from "@/lib/platforms/types";

export interface OnboardingInputs {
  workspace: Pick<Workspace, "accountType" | "nicheBrief">;
  /** `workspaces.account_confirmed_at` (ISO); onaylanmadıysa undefined. */
  accountConfirmedAt?: string;
  /** Çalışma alanının kendi hesapları (oluşturma sırasıyla; akış İLKİNİ kullanır). */
  ownAccounts: readonly OwnAccount[];
  /** Çalışma alanının TÜM başlangıç işleri (herhangi bir sırada; başka türler yok sayılır). */
  jobs: readonly PanelJob[];
  candidateCount: number;
  trackedCount: number;
  hasPlan: boolean;
  /** Toplanmış içerik var mı. */
  hasContent: boolean;
}

export function buildOnboardingState(input: OnboardingInputs): OnboardingState {
  const account = input.ownAccounts[0];
  const jobFacts = onboardingJobFacts(input.jobs);
  const { probeResult, ...facts } = jobFacts;
  const status = deriveOnboarding({
    ...facts,
    hasAccount: account !== undefined,
    accountConfirmed: input.accountConfirmedAt !== undefined,
    candidateCount: input.candidateCount,
    hasPlan: input.hasPlan,
    hasData: input.hasContent || input.trackedCount > 0,
  });
  const activeJob = input.jobs.find((job) => onboardingPhaseOf(job) !== undefined && isActiveJob(job));
  const left = (phase: OnboardingPhase, attempts: number) => Math.max(0, ONBOARDING_PHASE_SPEC[phase].attemptsMax - attempts);
  return {
    ...status,
    ...(account === undefined
      ? {}
      : {
          account: {
            id: account.id,
            platform: account.platform,
            handle: account.handle,
            connection: account.connection,
            ...(account.displayName === undefined ? {} : { displayName: account.displayName }),
            ...(account.followers === undefined ? {} : { followers: account.followers }),
          },
        }),
    accountType: input.workspace.accountType,
    ...(input.workspace.nicheBrief === undefined ? {} : { nicheBrief: input.workspace.nicheBrief }),
    ...(input.accountConfirmedAt === undefined ? {} : { accountConfirmedAt: input.accountConfirmedAt }),
    ...(probeResult === undefined ? {} : { probe: probeResult }),
    ...(activeJob === undefined ? {} : { activeJobId: activeJob.id }),
    candidateCount: input.candidateCount,
    trackedCount: input.trackedCount,
    attemptsLeft: { probe: left("probe", facts.probeAttempts), build: left("build", facts.buildAttempts) },
  };
}

const NOT_NOW: Record<Exclude<OnboardingAction, "add_account" | "resume">, string> = {
  start_probe: "Hesaba bakış şu an başlatılamaz.",
  confirm_account: "Hesap şu an onaylanamaz: önce hesabına bakmam gerekiyor ya da ilk inceleme çoktan başladı.",
  start_build: "İlk inceleme şu an başlatılamaz.",
};

/** Akış bu eylemi beklemiyorsa `invalid_state`. Hesap onayı bakış bittikten sonra, ilk tur başlayana kadar yinelenebilir. */
export function assertOnboardingAction(state: Pick<OnboardingState, "step" | "next">, action: keyof typeof NOT_NOW): void {
  const allowed = action === "confirm_account" ? state.step === "review_account" || state.step === "choose_rivals" : state.next === action;
  if (!allowed) throw new RepositoryError("invalid_state", NOT_NOW[action]);
}

/**
 * Mock deponun DB kurallarıyla (migration 0021) AYNI denetimi: aşamanın deneme sınırı, bakış bitmeden ilk tur yok, hesap başına tek ilk tur.
 * `jobs` çalışma alanının işleridir. Sorun yoksa undefined.
 */
export function onboardingRequestProblem(jobs: readonly PanelJob[], phase: OnboardingPhase): { code: RepositoryErrorCode; message: string } | undefined {
  const ofPhase = (wanted: OnboardingPhase) => jobs.filter((job) => onboardingPhaseOf(job) === wanted);
  if (phase === "build" && ofPhase("build").some((job) => isActiveJob(job) || job.status === "succeeded" || job.status === "partial")) {
    return { code: "already_exists", message: ONBOARDING_ERROR.buildExists };
  }
  if (ofPhase(phase).length >= ONBOARDING_PHASE_SPEC[phase].attemptsMax) return { code: "invalid_state", message: ONBOARDING_ERROR.limit };
  if (phase === "build" && !ofPhase("probe").some((job) => job.status === "succeeded" || job.status === "partial")) {
    return { code: "invalid_state", message: ONBOARDING_ERROR.needsProbe };
  }
  return undefined;
}

/** Depo hata metinleri (mock doğrudan, Supabase `errors.ts` çevirisinde AYNI metin). */
export const ONBOARDING_ERROR = {
  buildExists: "Bu hesabın ilk incelemesi zaten yapıldı ya da sürüyor.",
  limit: "Bu hesap için deneme hakkı bitti.",
  needsProbe: "İlk inceleme, hesaba bakış bitmeden başlatılamaz.",
  accountExists: "Bu hesabı zaten ekledin.",
  noModule: "Bu platform için henüz destek yok.",
  notDiscardable: "Bu hesap artık kaldırılamaz: onaylanmış ya da üzerinde çalışılmış.",
} as const;

/** Elle eklenen rakip adayının kullanıcı adı: kırpılır, "@" atılır, küçük harf; biçim `HANDLE_PATTERN` (aksi `invalid_input`). */
export function normalizeRivalHandle(input: string): string {
  const handle = input.trim().replace(/^@+/, "").toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) throw new RepositoryError("invalid_input", `Geçersiz kullanıcı adı: "${input}"`);
  return handle;
}

/**
 * Yanlış açılan çalışma alanını kaldırma kuralının mock karşılığı (Supabase'de `discard_unconfirmed_workspace` RPC'si AYNI kuralı DB'de
 * tutar): hesap onaylanmamış, ilk tur hiç açılmamış, etkin iş yok. Sorun yoksa undefined.
 */
export function onboardingDiscardProblem(input: { accountConfirmed: boolean; jobs: readonly PanelJob[] }): string | undefined {
  if (input.accountConfirmed) return ONBOARDING_ERROR.notDiscardable;
  if (input.jobs.some((job) => isActiveJob(job) || onboardingPhaseOf(job) === "build" || onboardingPhaseOf(job) === undefined)) return ONBOARDING_ERROR.notDiscardable;
  return undefined;
}

/**
 * "Başlat"ta seçilen rakiplerin denetimi: hepsi bu çalışma alanının `candidate` ya da `tracked` kaydı ve kendi hesapla AYNI platformdan
 * olmalı (`rivalPlatformProblem`); aksi `invalid_input`. İzlemeye alınacak (henüz `candidate` olan) kimlikleri döndürür.
 */
export function rivalsToTrack(competitors: readonly Pick<Competitor, "id" | "platform" | "status" | "handle">[], rivalIds: readonly string[], ownPlatform: Platform): string[] {
  const toTrack: string[] = [];
  for (const id of rivalIds) {
    const rival = competitors.find((competitor) => competitor.id === id);
    if (rival === undefined || (rival.status !== "candidate" && rival.status !== "tracked")) {
      throw new RepositoryError("invalid_input", "Seçilen hesaplardan biri artık listede yok. Sayfayı yenileyip tekrar seç.");
    }
    const problem = rivalPlatformProblem([ownPlatform], rival.platform);
    if (problem !== undefined) throw new RepositoryError("invalid_input", problem);
    if (rival.status === "candidate") toTrack.push(rival.id);
  }
  return toTrack;
}
