/**
 * Panel işi (`panel_jobs`, migration 0016): panelden başlatılan iş (haftalık tur, toplama, ölçüm, video inceleme, açı etiketleme, plan,
 * notlar). `collection_runs` (sağlayıcı çağrısı defteri) ve `publish_jobs` (yayın işi) ile KARIŞMAZ. Plan: `docs/PANEL-KONTROL-PLAN.md`.
 *
 * Akış: düğme → `requestJobAction` → `PanelRepository.requestJob` (satır `queued`) → ayrık işçi (`scripts/job-worker.mts`) işi alır
 * (`claim_panel_job`), mevcut `runX` işlevlerini koşturur, her adımda satırı günceller ve nabız atar → ekran `GET /api/isler` ile yoklar.
 *
 * Kurallar (DB de tutar: CHECK + trigger): ONAYSIZ HARCAMA YOK (`collect`/`measure` kuru koşu değilse onay ister); onay yalnız iş
 * açılırken yazılır ve sonra değişmez; işçi harcama tavanını YALNIZ `approval.maxUsd`'den okur; çalışma alanı başına tek etkin iş;
 * bitmiş iş donar. Bilinmeyen / ölçülemeyen değer `undefined`'dır (0 değil): tahmin, harcama, sayaç.
 * Bu dosya saftır (sunucu + istemci); görünüm modeli `panel-job-view.ts`, jsonb zod sözleşmesi `lib/data/job-schema.ts`. Başlangıç akışının
 * işi (`onboarding`: iki aşama, sabit tavan, deneme sınırı; migration 0021) `onboarding-job.ts`'te ayrıntılanır.
 */
import { BRIEFING_COMMANDS, type BriefingCommandId } from "@/lib/domain/briefing";
import type { CreditUnits } from "@/lib/domain/credit-pricing";
import type { CreditChargeUnits } from "@/lib/domain/credits";
import type { OnboardingPhase, OnboardingProbeResult } from "@/lib/domain/onboarding-job";

// ---------------------------------------------------------------------- Tür

/** İş türleri (DB check ile birebir). Yeni tür = migration + bu liste + `JOB_KIND_SPEC` + düz dil sözlüğü birlikte. */
export const JOB_KINDS = ["routine", "collect", "measure", "analyze", "label", "plan", "briefing", "onboarding", "measure_zernio", "discover", "order", "order_return", "publish", "ads_sync"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

/**
 * Onay dayanağı (DB check ile birebir; migration 0021). USD (Apify) onayı: `one_time` = bu iş için açık tutar · `monthly_cap` = çalışma
 * alanının onaylı aylık tavanı içinde · `onboarding` = başlangıç akışındaki düğme (aşamanın SABİT tavanı; tutar girdiden gelmez, yalnız
 * `onboarding` türünde). `credits` = YALNIZ kredi onayı var, USD onayı yok (iş kredi harcar, Apify'a para harcatamaz).
 * Kredi onayı USD onayının yerine GEÇMEZ; ikisi birlikteyse dayanak USD'ninkidir ve kredi tavanı `JobApproval.maxCredits`'te durur.
 */
export const JOB_USD_APPROVAL_BASES = ["one_time", "monthly_cap", "onboarding"] as const;
export type JobUsdApprovalBasis = (typeof JOB_USD_APPROVAL_BASES)[number];
export const JOB_APPROVAL_BASES = [...JOB_USD_APPROVAL_BASES, "credits"] as const;
export type JobApprovalBasis = (typeof JOB_APPROVAL_BASES)[number];

/** Dayanak bir USD (Apify) onayı mı (`credits` değil). */
export function isUsdApprovalBasis(basis: JobApprovalBasis | undefined): basis is JobUsdApprovalBasis {
  return basis !== undefined && (JOB_USD_APPROVAL_BASES as readonly string[]).includes(basis);
}

/** Para (Apify): `always` = onaysız koşmaz · `optional` = tutar onaylanırsa harcayan adım da koşar · `never` = abonelik / $0. */
export type JobSpend = "always" | "optional" | "never";

export interface JobKindSpec {
  /** Komut tablosundaki karşılığı (`BRIEFING_COMMANDS`): betik adı ve yedek komut metni oradan gelir. Yoksa işin terminal betiği YOKTUR. */
  commandId?: BriefingCommandId;
  spend: JobSpend;
  /** Bu türde kabul edilen USD onay dayanakları (`never` türde boş). KARAR TABLOSU: kullanıcı kararı değişirse yalnız burası değişir. */
  approvalBases: readonly JobUsdApprovalBasis[];
  /** "Önce bak" (kuru koşu, $0) var mı. */
  preview: boolean;
  /** Süre tavanı (dk): aşılırsa işçi işi `failed` + `timeout` ile kapatır. */
  timeoutMinutes: number;
}

/**
 * Tür tablosu. Kararlar (2026-10-05): toplamada her seferinde tutar onayı (`one_time`); ölçümde aylık ölçüm tavanı onaylıysa
 * `monthly_cap`, değilse tutar; haftalık turda tutar verilmezse toplama adımı onay bekler, diğer adımlar $0 koşar. Başlangıç işi
 * (2026-10-13): komutu ve önizlemesi yok, onayı sunucu yazar (`onboarding`, sabit tavan), `/isler` başlatma paneline girmez.
 */
export const JOB_KIND_SPEC: Record<JobKind, JobKindSpec> = {
  routine: { commandId: "routine", spend: "optional", approvalBases: ["one_time"], preview: true, timeoutMinutes: 60 },
  collect: { commandId: "collect", spend: "always", approvalBases: ["one_time"], preview: true, timeoutMinutes: 30 },
  measure: { commandId: "measure", spend: "always", approvalBases: ["one_time", "monthly_cap"], preview: true, timeoutMinutes: 30 },
  analyze: { commandId: "analyze", spend: "never", approvalBases: [], preview: false, timeoutMinutes: 30 },
  label: { commandId: "label", spend: "never", approvalBases: [], preview: false, timeoutMinutes: 30 },
  plan: { commandId: "plan", spend: "never", approvalBases: [], preview: false, timeoutMinutes: 30 },
  briefing: { commandId: "brief", spend: "never", approvalBases: [], preview: false, timeoutMinutes: 30 },
  onboarding: { spend: "always", approvalBases: ["onboarding"], preview: false, timeoutMinutes: 60 },
  // Halka uçları (2026-10-20): komutu / önizlemesi yok. `measure_zernio` resmi API'den okur ($0, onaysız); `discover` rakip adayı arar (Apify, tutar onayı).
  measure_zernio: { spend: "never", approvalBases: [], preview: false, timeoutMinutes: 15 },
  discover: { spend: "always", approvalBases: ["one_time"], preview: false, timeoutMinutes: 30 },
  // Stüdyo siparişi (2026-10-20): plan öğesinden sipariş fişi yazar (dosya, $0, onaysız, önizlemesiz; fiş `onay: hayir` doğar).
  order: { spend: "never", approvalBases: [], preview: false, timeoutMinutes: 5 },
  // Dönüş + yayın (2026-10-20): `order_return` stüdyodan dönen videoyu onay bekleyen yayın satırına çevirir; `publish` YALNIZ insanca onaylanmış satırı zamanlar.
  // İkisi de para harcamaz, onay kaydı taşımaz (onay `publish_jobs` satırındadır), önizlemesizdir.
  order_return: { spend: "never", approvalBases: [], preview: false, timeoutMinutes: 5 },
  publish: { spend: "never", approvalBases: [], preview: false, timeoutMinutes: 20 },
  // Reklam (2026-10-21, migration 0029): `ads_sync` reklam verisini resmi API'den (Zernio) OKUR. $0, onaysız (Apify parası yok, reklam hesabına yazmaz), önizlemesiz.
  ads_sync: { spend: "never", approvalBases: [], preview: false, timeoutMinutes: 10 },
};

/** Terminal komutu olan (düğmeyle / komutla tek başına başlatılabilen) türler: başlangıç işi akışından başlar, komutu yoktur. */
export type CommandJobKind = Exclude<JobKind, "onboarding" | "measure_zernio" | "discover" | "order" | "order_return" | "publish" | "ads_sync">;

/** Komut kimliği → iş türü (komutu olan türlerle birebir): komut metni gösteren her yer aynı işi düğmeyle başlatır. */
export const JOB_KIND_BY_COMMAND: Record<BriefingCommandId, CommandJobKind> = {
  routine: "routine",
  collect: "collect",
  measure: "measure",
  analyze: "analyze",
  label: "label",
  plan: "plan",
  brief: "briefing",
};

/** Türün npm betik adı (yedek komut metni: `workspaceCommand(jobScript(kind), çalışmaAlanı)`); betiği olmayan türde (`onboarding`) undefined. */
export function jobScript(kind: JobKind): string | undefined {
  const commandId = JOB_KIND_SPEC[kind].commandId;
  return commandId === undefined ? undefined : BRIEFING_COMMANDS[commandId].script;
}

/** Ajanın aylık ajan tavanıyla (`monthly_cap`) açabildiği paralı türler; insan yolu (`approvalBases`) `one_time` kalır, `monthly_cap` YALNIZ `source = "agent"` ile geçer. */
export const AGENT_CAP_KINDS: readonly JobKind[] = ["collect", "discover"];
/** Bu tür bu USD dayanağını kabul eder mi: tür tablosu + ajan tavanı istisnası. */
export const jobAcceptsBasis = (kind: JobKind, basis: JobUsdApprovalBasis): boolean =>
  JOB_KIND_SPEC[kind].approvalBases.includes(basis) || (basis === "monthly_cap" && AGENT_CAP_KINDS.includes(kind));

/** KISIT 1: bu iş onaysız yazılamaz mı (harcayan tür + gerçek koşu). */
export function jobRequiresApproval(kind: JobKind, dryRun: boolean): boolean {
  return !dryRun && JOB_KIND_SPEC[kind].spend === "always";
}

/** KISIT 2: bu işe onay kaydı yazılabilir mi (harcayabilen tür + gerçek koşu). */
export function jobAllowsApproval(kind: JobKind, dryRun: boolean): boolean {
  return !dryRun && JOB_KIND_SPEC[kind].spend !== "never";
}

// --------------------------------------------------------------------- Onay

/** Tek seferlik onayın üst sınırı (USD); `collect:now --max-usd` ve `rutin --apify-max` ile aynı (`MAX_USD_CEILING`). DB check'i de 2. */
export const JOB_SPEND_MAX_USD = 2;
/** Onay bu süreden eskiyse işçi HARCAMAZ (iş `blocked` + `approval_expired`); tekrar = yeni onay. */
export const JOB_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
/** Önerilen onay tutarının yuvarlama adımı (USD). */
const APPROVAL_STEP_CENTS = 5;

/** Onay kaydı. `maxUsd` yoksa (`monthly_cap`) tavan çalışma alanındaki onaylı aylık tavandır; `credits` dayanağında USD yetkisi yoktur. */
export type JobApproval = {
  basis: JobApprovalBasis;
  /** Onaylı üst sınır (USD); `one_time` ve `onboarding`'de zorunlu. İşçi bundan fazlasını harcatacak hiçbir koşuyu başlatmaz. */
  maxUsd?: number;
  /** Onaylı kredi tavanı (iş açılırken bu kadar kredi AYRILDI; iş bundan fazlasını harcayamaz). Yoksa iş krediye bağlı değildir. */
  maxCredits?: number;
  /** Onaylayan kullanıcı (çalışma alanının sahip / editör üyesi). */
  approvedBy: string;
  /** Onay anı (ISO). */
  approvedAt: string;
};

/** Onay kuralının baktığı çalışma alanı tavanları (`Workspace`'in alt kümesi). */
export interface JobSpendCaps {
  /** Aylık Apify tavanı (USD); 0 = harcama kapalı. */
  apifyMonthlyCapUsd?: number;
  /** Aylık ÖLÇÜM tavanı (USD); undefined = onaysız, 0 = ölçüm kapalı. */
  measureMonthlyCapUsd?: number;
  /** Aylık AJAN tavanı (USD); undefined = onaysız, 0 = kapalı. Yalnız ajanın `monthly_cap` toplama / rakip bulma işini etkiler. */
  agentMonthlyCapUsd?: number;
}

/**
 * Bu türde, çalışma alanının ŞU ANKİ tavan durumunda kullanılabilecek onay dayanakları (öncelik sırasıyla; ekran ilkini önerir). Boş
 * liste = bu iş şu an para harcayamaz (ölçüm kapalı, Apify harcaması kapalı ya da tür hiç harcamaz). Kurallar:
 *  - `monthly_cap` yalnız ilgili aylık tavan ONAYLI ve > 0 ise (ölçümde ölçüm tavanı; diğerlerinde Apify tavanı) — ilk sırada önerilir;
 *  - Apify tavanı 0 ise hiçbir dayanak yok; ölçüm tavanı 0 ("kapalı") ise ölçümde hiçbir dayanak yok.
 * Depo (`assertJobApprovalAllowed`) ve onay penceresi AYNI fonksiyonu kullanır.
 */
export function availableApprovalBases(kind: JobKind, caps: JobSpendCaps): JobUsdApprovalBasis[] {
  const allowed = JOB_KIND_SPEC[kind].approvalBases;
  if (allowed.length === 0 || caps.apifyMonthlyCapUsd === 0) return [];
  const monthlyCap = kind === "measure" ? caps.measureMonthlyCapUsd : caps.apifyMonthlyCapUsd;
  if (kind === "measure" && monthlyCap === 0) return [];
  const monthlyOpen = monthlyCap !== undefined && monthlyCap > 0;
  return [...allowed.filter((basis) => basis === "monthly_cap" && monthlyOpen), ...allowed.filter((basis) => basis !== "monthly_cap")];
}

/** Onay hâlâ geçerli mi: 0 ≤ yaş ≤ `JOB_APPROVAL_TTL_MS`. Okunamayan ya da gelecekteki an → geçersiz (harcatmaz). */
export function isJobApprovalFresh(approvedAt: string, now: Date): boolean {
  const age = now.getTime() - Date.parse(approvedAt);
  return Number.isFinite(age) && age >= 0 && age <= JOB_APPROVAL_TTL_MS;
}

/**
 * Onay penceresinin ön değeri: tahminin 0,05'e YUKARI yuvarlanmışı. Tahmin yok / geçersiz ya da yuvarlanmış tutar `JOB_SPEND_MAX_USD`'yi
 * aşıyorsa `undefined` (ön değer önerilmez; 0 ya da tavan uydurulmaz).
 */
export function suggestApprovalUsd(estimateUsd: number | undefined): number | undefined {
  if (estimateUsd === undefined || !Number.isFinite(estimateUsd) || estimateUsd <= 0) return undefined;
  const cents = Math.ceil((estimateUsd * 100) / APPROVAL_STEP_CENTS - 1e-9) * APPROVAL_STEP_CENTS;
  const usd = cents / 100;
  return usd > JOB_SPEND_MAX_USD ? undefined : usd;
}

// -------------------------------------------------------------------- Durum

/**
 * queued: sırada · running: işçi aldı · succeeded: bitti · partial: en az bir adım başarısız · blocked: durdu (onay / tavan / veri
 * eksik; `result.outcome` nedenini söyler) · failed: hata, süre tavanı ya da işçi kaybı · cancelled: durduruldu.
 */
export const JOB_STATUSES = ["queued", "running", "succeeded", "partial", "blocked", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Etkin durumlar: çalışma alanı başına en çok BİR iş bu durumlarda olabilir. */
export const ACTIVE_JOB_STATUSES = ["queued", "running"] as const satisfies readonly JobStatus[];

export function isActiveJobStatus(status: JobStatus): boolean {
  return (ACTIVE_JOB_STATUSES as readonly JobStatus[]).includes(status);
}

export function isActiveJob(job: { status: JobStatus }): boolean {
  return isActiveJobStatus(job.status);
}

/** İptal edilebilir mi: yalnız etkin iş (bitmiş işi iptal `invalid_state`). */
export const canCancelJob = isActiveJobStatus;

// --------------------------------------------------------------------- Adım

/** Adım kimlikleri: haftalık turun adımları (`orchestrator` `ReportStepId` ile aynı) + tek adımlı `measure` + başlangıç akışınınkiler. */
export const JOB_STEP_IDS = ["precheck", "collect", "analyze", "label", "cluster", "plan", "measure_check", "measure", "briefing", "verify", "discover", "draft_niche", "measure_zernio", "order", "order_return", "publish", "ads_sync"] as const;
export type JobStepId = (typeof JOB_STEP_IDS)[number];

/** pending: sırası gelmedi · running: sürüyor · ok · skipped: tasarım gereği atlandı · failed · needs_approval: onay bekliyor (koşmadı). */
export const JOB_STEP_STATUSES = ["pending", "running", "ok", "skipped", "failed", "needs_approval"] as const;
export type JobStepStatus = (typeof JOB_STEP_STATUSES)[number];

/**
 * Türün adımları, koşu sırasıyla. İşçi `steps`'i bu sırayla yazar; tek adımlı işte tek adım vardır. `onboarding`'de iki aşamanın birleşimidir
 * (bir iş yalnız kendi aşamasının adımlarını yazar: `onboardingStepsOf`, `onboarding-job.ts`).
 */
export const JOB_STEPS_BY_KIND: Record<JobKind, readonly JobStepId[]> = {
  routine: ["precheck", "collect", "analyze", "label", "cluster", "plan", "measure_check", "briefing"],
  collect: ["collect"],
  measure: ["measure"],
  analyze: ["analyze"],
  label: ["label"],
  plan: ["plan"],
  briefing: ["briefing"],
  onboarding: ["verify", "collect", "discover", "draft_niche", "analyze", "label", "cluster", "plan", "briefing"],
  measure_zernio: ["measure_zernio"],
  discover: ["discover"],
  order: ["order"],
  order_return: ["order_return"],
  publish: ["publish"],
  ads_sync: ["ads_sync"],
};

// Sonuç kodları ayrı dosyada (dosya boyu sınırı); dışa açık ad değişmez.
import { JOB_OUTCOME_CODES, type JobOutcomeCode } from "@/lib/domain/panel-job-outcome";

export { JOB_OUTCOME_CODES, type JobOutcomeCode };

/** Bir adımın durumu. (jsonb'ye yazılan şekiller `type` takma adıdır: `Json` tipine atanabilsin.) */
export type JobStep = {
  id: JobStepId;
  status: JobStepStatus;
  /** Bilinen sonuç kodu (varsa). */
  code?: JobOutcomeCode;
  /** HAM not (yalnız yönetici görür): sağlayıcı adı, komut, sayı geçebilir; müşteriye gösterilmez. */
  note?: string;
  /** Süre (sn); adım koşmadıysa yok. */
  seconds?: number;
  /** Para harcayan adımda tahmin / gerçek (USD); bilinmeyen yok (0 değil). */
  spend?: { estimateUsd?: number; actualUsd?: number };
};

/** Adım içi sayaç (ör. incelemede video: 7/19). Sayaç yoksa alan hiç yoktur (0/0 yazılmaz). */
export type JobProgress = { done: number; total: number };

// -------------------------------------------------------------------- Sonuç

/** Tahmin dökümünün bir satırı (yönetici görür): ör. bir hesabın içerik koşusu. */
export type JobEstimateLine = { label: string; usd?: number };

/**
 * Kuru koşunun / onay öncesinin tahmini. Fiyat okunamadıysa `usd` yoktur (0 değil). `units`: işlenecek birim sayıları (kredi tahmininin
 * girdisi, `domain/credit-pricing.ts`); işçi yalnız bildiği sayıyı yazar, bilinmeyen alan yoktur (0 değil).
 */
export type JobEstimate = { usd?: number; lines: JobEstimateLine[]; units?: CreditUnits };

/**
 * İşin kredi kapanışı. `reserved` = iş açılırken ayrılan · `due` = yapılan birimlerin tutarı (işçinin hesabı) · `charged` = deftere
 * GERÇEKTEN düşülen (kesinleştirme yazılamadıysa yok: 0 değil; süpürme `due`'yu sonradan düşer) · `units` = düşülen birim sayıları.
 */
export type JobCredits = { reserved: number; due: number; charged?: number; units?: CreditChargeUnits; priceVersion?: string };

export type JobResult = {
  /** Bilinen sonuç kodu; `blocked` / `failed` / `partial` işte nedenidir. */
  outcome?: JobOutcomeCode;
  /** Betik çıkış kodu karşılığı (0 tamam · 4 kısmi · 1 önkontrol / hata). */
  exitCode?: number;
  estimate?: JobEstimate;
  /** Gerçekleşen harcama: rezerve ve (mutabakat bittiyse) gerçek tutar. */
  spend?: { reservedUsd?: number; actualUsd?: number };
  /** Kredi hesabı (yalnız krediye bağlı işte; `domain/job-credits.ts`). */
  credits?: JobCredits;
  /** Yazılan rapor dosyası (haftalık tur; depo köküne göre yol; yönetici görür). */
  reportPath?: string;
  /** Başlangıç `probe` işinin çıktısı: profil özeti + video sayısı + aday özeti (`getOnboardingState` ekrana bunu taşır). */
  probe?: OnboardingProbeResult;
};

// ----------------------------------------------------------------------- İş

/** Canlı işçinin aldığı kuyruk. Testler KENDİ kuyruk adını kullanır (açık bir işçi test işini alıp gerçek çağrı yapmasın). */
export const JOB_QUEUE_DEFAULT = "panel";
/** Kuyruk adı biçimi (DB check ile aynı). */
export const JOB_QUEUE_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/;
/** `collect` işinde hesap başına içerik sayısı üst sınırı (`collection/plan.ts` `MAX_CONTENT_LIMIT` ile aynı). */
export const JOB_COLLECT_LIMIT_MAX = 50;
/** Günlük kuyruğunun (`logTail`) üst sınırı (karakter; DB check ile aynı). İşçi baştan kırpar, sonu tutar. */
export const JOB_LOG_TAIL_MAX_CHARS = 8000;
/** Teknik hata metninin üst sınırı (karakter; DB check ile aynı). */
export const JOB_ERROR_MAX_CHARS = 2000;
/** `/isler` geçmiş listesinin boyu. */
export const JOB_HISTORY_LIMIT = 20;

/** Para DIŞI parametreler (harcama tavanı burada değil, `approval.maxUsd`'dedir). */
export type JobParams = {
  /** `collect`: hesap başına içerik sayısı (1..`JOB_COLLECT_LIMIT_MAX`); verilmezse betiğin varsayılanı. */
  limit?: number;
  /** `plan`: planın haftası (Pazartesi, YYYY-MM-DD); verilmezse betiğin varsayılanı (gelecek hafta). */
  week?: string;
  /** `order`: yalnız bu slot (örn. S1, P2). */
  slot?: string;
  /** `order`: yalnız bu fikir (UUID). */
  ideaId?: string;
  /** `onboarding`: aşama (ZORUNLU; DB check). */
  phase?: OnboardingPhase;
  /** `onboarding` `build`: "Başlat" ile izlemeye alınan rakipler (`competitors.id`; en çok `ONBOARDING_RIVALS_MAX`; boş / yok = rakipsiz). */
  rivalIds?: string[];
  /** İşi kim açtı: "cycle" = halka zinciri ($0) · "agent" = yönetici ajan (ajan tavanı içindeki `collect` / `discover`; `monthly_cap` yalnız bununla geçer, DB tutar). Elle açılan işte yok. */
  source?: "cycle" | "agent";
};

export interface PanelJob {
  id: string;
  workspaceId: string;
  queue: string;
  kind: JobKind;
  /** Kuru koşu ("önce bak"): $0, yazma / LLM / Apify yok. */
  dryRun: boolean;
  params: JobParams;
  status: JobStatus;
  /** Harcama onayı; yoksa iş para harcayamaz. */
  approval?: JobApproval;
  /** Adımlar, koşu sırasıyla; iş henüz alınmadıysa boş. */
  steps: JobStep[];
  currentStep?: JobStepId;
  progress?: JobProgress;
  /** Günlüğün son satırları (yalnız yönetici görür). */
  logTail?: string;
  result?: JobResult;
  /** Teknik hata metni (yalnız yönetici görür). */
  error?: string;
  /** İşi alan işçi; sıradaki işte yok. */
  workerId?: string;
  /** Son nabız (ISO); `JOB_STALE_AFTER_MS`'ten eskiyse iş "yanıt vermiyor". */
  heartbeatAt?: string;
  /** Durdurma isteği (ISO): çalışan iş adım / video sınırında durur. */
  cancelRequestedAt?: string;
  requestedBy?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

// ------------------------------------------------------------ Zaman kuralları

/** İşçi nabzı (ms). */
export const JOB_HEARTBEAT_INTERVAL_MS = 10_000;
/** Nabzı bundan eski `running` iş "yanıt vermiyor"dur. DB (`private.panel_job_stale_after`) ile AYNI değer: 90 sn. */
export const JOB_STALE_AFTER_MS = 90_000;
/** Ekranın yoklama aralığı (ms); yalnız etkin iş varken, sekme görünürken. */
export const JOB_POLL_INTERVAL_MS = 4_000;
/** Bu kadar süredir `queued` duran iş için işçi dürtülür (işçi ölmüş olabilir). */
export const JOB_KICK_AFTER_MS = 15_000;
/** Aynı tarayıcı iki dürtme arasında en az bu kadar bekler (sırada bekleyen iş her yoklamada işçi doğurmasın). */
export const JOB_KICK_MIN_INTERVAL_MS = 30_000;

/** `stale: true` = çalışıyor görünen ama nabzı bayat iş; `silentMs` son nabızdan beri geçen süre (nabız okunamıyorsa yok). */
export type JobStaleness = { stale: false } | { stale: true; silentMs?: number };

/**
 * "Yanıt vermiyor" kuralı (saf; ekran ve depo AYNI fonksiyonu kullanır). Yalnız `running` iş bayat olabilir: son nabız
 * `JOB_STALE_AFTER_MS`'ten eskiyse ya da okunamıyorsa bayattır. Bayat iş kendiliğinden KAPANMAZ (uyku / kapak sonrası yanlış kapatma
 * olmasın): yalnız yeni iş isteği, claim ve iptal anında `failed` + `worker_lost` olur.
 */
export function jobStaleness(job: Pick<PanelJob, "status" | "heartbeatAt">, now: Date): JobStaleness {
  if (job.status !== "running") return { stale: false };
  const beat = job.heartbeatAt === undefined ? Number.NaN : Date.parse(job.heartbeatAt);
  if (Number.isNaN(beat)) return { stale: true };
  const silentMs = now.getTime() - beat;
  return silentMs > JOB_STALE_AFTER_MS ? { stale: true, silentMs } : { stale: false };
}

/** Sıradaki iş `JOB_KICK_AFTER_MS`'tir bekliyor mu: işçi dürtülmeli (dürtme idempotenttir: fazla işçi iş alamaz, çıkar). */
export function needsWorkerKick(job: Pick<PanelJob, "status" | "createdAt">, now: Date): boolean {
  if (job.status !== "queued") return false;
  const waited = now.getTime() - Date.parse(job.createdAt);
  return Number.isFinite(waited) && waited >= JOB_KICK_AFTER_MS;
}

// ------------------------------------------------------------ İşçi sözleşmesi

/** İşçi betiği (depo köküne göre). Panel onu SABİT argümanlarla başlatır: istekten gelen hiçbir değer komut satırına girmez. */
export const JOB_WORKER_SCRIPT = "scripts/job-worker.mts";
/** `--drain`: sıradaki işleri al, kuyruk boşalınca çık (panelin başlattığı) · `--watch`: sürekli bekle (yedek / zamanlayıcı). */
export const JOB_WORKER_MODES = ["--drain", "--watch"] as const;
export type JobWorkerMode = (typeof JOB_WORKER_MODES)[number];
