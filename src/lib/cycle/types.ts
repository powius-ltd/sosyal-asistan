/**
 * Halka durumu tipleri. Durum SAKLANMAZ, türetilir (başlangıç akışının `deriveOnboarding` deseni): okuyucu olguları toplar
 * (`read.ts`), `deriveCycle` (saf) adım durumlarını kurar. Ekran ve ajan aynı nesneyi okur (`schema.ts` JSON sözleşmesi).
 */
import type { AccountType } from "@/lib/domain/account-type";
import type { JobKind, JobStatus } from "@/lib/domain/panel-job";

/** Halkanın adımları, sırasıyla. `slip` (fiş) ve `learn` (öğren) için kod henüz yok (`not_built`); `share` (yayın) stüdyo videosunu dönüş + onay + yayın hattına bağlar. */
export const CYCLE_STEP_IDS = ["account", "rivals", "collect", "analyze", "label", "plan", "slip", "share", "measure", "learn"] as const;
export type CycleStepId = (typeof CYCLE_STEP_IDS)[number];

/**
 * done: bu tur için tamam · due: yapılacak, $0 ve onaysız başlatılabilir · needs_approval: yapılacak ama para harcar (tutar onayı ister) ·
 * blocked: önkoşul eksik ya da engel var (neden `reason`'da) · not_built: bu adımın kodu henüz yok.
 */
export const CYCLE_STATUSES = ["done", "due", "needs_approval", "blocked", "not_built"] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

/** Adımla ilgili son iş (panel işi); iş hiç koşmadıysa adımda yoktur. */
export interface CycleLastJob {
  kind: JobKind;
  status: JobStatus;
  /** Bitiş anı (ISO); süren işte yok. */
  finishedAt?: string;
  /** İşin sonuç kodu (`result.outcome`, örn. `nothing_to_do`); sonuç yazılmadıysa yok. */
  outcome?: string;
}

export interface CycleStep {
  id: CycleStepId;
  status: CycleStatus;
  /** Tek cümle neden (Türkçe, sayılarla). */
  reason: string;
  /** Bu adım yapılacaksa başlatılacak iş türü; adım panelden başlatılamıyorsa yok. */
  jobKind?: JobKind;
  lastJob?: CycleLastJob;
}

export interface CycleState {
  workspaceId: string;
  /** Durumun hesaplandığı an (ISO). */
  asOf: string;
  accountType: AccountType;
  /** Sıradaki adım: `due` ya da `needs_approval` olan ilk adım; yoksa halka bu tur için tamam. */
  next?: CycleStepId;
  steps: CycleStep[];
}

/** Yayın hattı olguları: dönmeyi bekleyen fiş, insan onayı bekleyen satır, gönderilecek / kapatılacak onaylı satır. */
export interface PublishQueueFacts {
  /** `uretildi` + onaylı fişi olup henüz yayın satırı açılmamış sipariş. */
  returnable: number;
  /** `awaiting_approval` satırı (onay İNSANDA; zincir onaylamaz). */
  awaitingApproval: number;
  /** Onaylı (`approved`) ya da saati geçmiş `ready` satır: `publish` işi bunlara bakar. */
  dueForPublish: number;
  /** Yalnız `approved` satır (insanca onaylanmış YENİ iş): "ilerletmeyen publish" atlama kuralını açar. */
  approved: number;
}

/** `deriveCycle`'ın girdisi: veritabanından toplanan ham olgular (`read.ts`). */
export interface CycleFacts {
  workspaceId: string;
  accountType: AccountType;
  ownAccounts: number;
  trackedRivals: number;
  /** Kendi + rakip içerik sayısı. */
  contentCount: number;
  /** En son toplama anı (ISO); hiç toplanmadıysa yok. */
  lastCollectedAt?: string;
  /** İncelemesi olmayan içerik sayısı. */
  pendingAnalysis: number;
  analyzedCount: number;
  /** İncelenmiş ama açı etiketi olmayan içerik sayısı. */
  pendingLabels: number;
  /** Gelecek haftanın (Pazartesi) planı var mı. */
  nextWeekPlan: boolean;
  /** Bu haftanın planı var mı. */
  thisWeekPlan: boolean;
  /** Kendi hesabın içerik sayısı (ölçülebilir paylaşım). */
  ownContentCount: number;
  /** Kendi içerikten en son ölçüm anı (ISO). */
  lastMeasuredAt?: string;
  /** Zernio anahtarı bu çalışma alanı için tanımlı mı. */
  zernioKey: boolean;
  /** Son işler, yeniden eskiye (kuru koşular hariç). */
  jobs: CycleLastJob[];
  /** Stüdyo videosunun dönüş + yayın kuyruğu (`publish_jobs.order_id`); okunmadıysa (eski çağıran) boş sayılır. */
  publishQueue?: PublishQueueFacts;
  /** Toplama sıklığı (gün; `workspaces.collect_every_days`). Yoksa `CYCLE_RULES.collectFreshDays` (yedek). */
  collectEveryDays?: number;
  /** Toplamada hesap başına video (`collect_video_limit`); toplama işini açan katman okur, durum türetimi kullanmaz. */
  collectVideoLimit?: number;
  /** Hedef izlenen rakip sayısı (`rival_target`). Yoksa eski kural: en az 1 izlenen rakip yeter. */
  rivalTarget?: number;
  /** İzlemeye alınmamış bekleyen rakip adayı sayısı (`competitors.status = candidate`); seçim insandadır, ajan izlemeye almaz. */
  pendingCandidates?: number;
  /** Gelecek haftanın Pazartesi'si (YYYY-MM-DD); neden metninde kullanılır. */
  nextWeekStart: string;
}
