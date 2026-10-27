/**
 * "Bugün" ana ekranının girdi/çıktı tipleri (`docs/arayuz-fikir/02-ai-ana-ekran.md` Konsept A): AI'ın kısa sözü + sırayla tüketilen
 * karar kuyruğu. Girdi Genel bakış özetinin girdisini (`OverviewSummaryInput`) SARAR; okunamayan parça `undefined` kalır, ilgili kart
 * ya da cümle düşer (`undefined` ≠ 0). Serileştirilebilir düz nesnelerdir: sunucu bileşeninden istemci yaprağına aynen geçer.
 */
import type { Briefing, BriefingEvidenceRef, BriefingStaleReason } from "@/lib/domain/briefing";
import type { OnboardingStatus } from "@/lib/domain/onboarding";
import type { IdeaLink, IdeaLinkDecision } from "@/lib/domain/outcomes";
import type { PublishJob } from "@/lib/domain/publish";
import type { Workspace } from "@/lib/domain/run";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";
import type { OverviewSummaryInput, SummaryLink } from "@/lib/overview/types";

// -------------------------------------------------------------------- Girdi

/** Karar kartlarının okuduğu yayın işi alanları (uyum denetimi alanları dahil). */
export type TodayPublishJob = Pick<PublishJob, "id" | "ideaId" | "caption" | "scheduledFor" | "paidPartnership" | "aiGenerated" | "advertiserName">;

/** Panel işlerinin "Bugün"e yansıyan durumu (sayfa iş durumundan kurar; yalnız yönetici modunda okunur). */
export interface TodayJobsState {
  /** İşler bu istekte panelden başlatılabiliyor (yönetici modu + ortam uygun). */
  canRun: boolean;
  /** Çalışma alanında sırada bekleyen ya da çalışan (yanıt veren) bir iş var: yenisi açılamaz. */
  busy: boolean;
}

export interface TodayInput {
  /** İstekteki tek saat (`getPanelContext().now`); burada `Date.now()` okunmaz. */
  now: Date;
  /** Genel bakış özetinin girdisi (operatör modu, hesaplar, göstergeler, plan, sayımlar). */
  summary: OverviewSummaryInput;
  /** `null` = çalışma alanı kaydı yok, `undefined` = okunamadı. */
  workspace?: Pick<Workspace, "timezone" | "nicheBrief" | "accountType" | "complianceRegion"> | null;
  /** En güncel notlar; `null` = hiç not yok ya da okunamadı. */
  briefing: Briefing | null;
  /** Onay bekleyen otomatik Reels eşleşme önerileri (kart başına bir); okunamadıysa undefined. */
  suggestedLinks?: readonly IdeaLink[];
  /** Onay bekleyen yayın işleri; okunamadıysa undefined (sayı `summary.pendingApproval`'dan söylenir). */
  pendingJobs?: readonly TodayPublishJob[];
  /** Karar bekleyen rakip adayı sayısı; yalnız yönetici modunda okunur. */
  rivalCandidates?: number;
  /** İş durumu; okunmadıysa (müşteri modu, okuma hatası) undefined: iş başlatan kart üretilmez. */
  jobs?: TodayJobsState;
  /**
   * Başlangıç akışının adımı (`repo.getOnboardingState`); okunamadıysa ya da akış bu ortamda ilerletilemiyorsa undefined: başlangıç kartı
   * üretilmez. Akış açıkken (`isOnboardingOpen`) kuyruğun başında tek kart durur ve ilk kurulum kartları (hesap, konu, tür) çıkmaz:
   * onları akış sorar.
   */
  onboarding?: Pick<OnboardingStatus, "step" | "next" | "reason">;
}

// --------------------------------------------------------------------- Kart

/** Karar kartı türleri (kapalı liste; her birinin kodda gerçek bir eylemi ya da sayfası vardır). */
export const DECISION_KINDS = [
  "onboarding",
  "connect_account",
  "setup_niche",
  "setup_account_type",
  "approve_publish",
  "confirm_link",
  "paste_reel_link",
  "shoot_next",
  "measurement_budget",
  "review_rivals",
  "run_routine",
] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

/**
 * Kartın düğmesi. `action` = mevcut server action'ın dışa aktarılan ADI (bileşen bu anahtarı gerçek fonksiyona eşler; yük sunucuda
 * yine zod ile doğrulanır). `linkIdeaToReelAction` kullanıcıdan bağlantı ister: `input: "url"` alanı yüke `url` olarak eklenir.
 * `requestJobAction` panel işi başlatır: karttan yalnız onaysız haftalık tur (para harcamaz; harcama onayı karttan VERİLMEZ).
 */
export type DecisionAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "action"; action: "approvePublishJob"; label: string; payload: { jobId: string } }
  | { kind: "action"; action: "resolveIdeaLinkAction"; label: string; payload: { linkId: string; decision: IdeaLinkDecision } }
  | { kind: "action"; action: "linkIdeaToReelAction"; label: string; payload: { ideaId: string }; input: "url" }
  | { kind: "action"; action: "requestJobAction"; label: string; payload: { kind: "routine" } };

export type DecisionActionKey = Extract<DecisionAction, { kind: "action" }>["action"];

export interface DecisionCard {
  /** Kararlı kimlik: `<tür>:<kayıt kimliği>` (aynı veri → aynı kimlik; React anahtarı ve "karar verildi" izi). */
  id: string;
  kind: DecisionKind;
  /** Düz dil başlık ve gövde (panel jargonu yok). */
  title: string;
  body: string;
  primary: DecisionAction;
  secondary?: DecisionAction;
  /** "Neden?" kanıtları (`briefing-refs` biçimi; bağlantı `briefingRefHref` ile türer). */
  evidence: BriefingEvidenceRef[];
  /** Biliniyorsa güven (`CONFIDENCE_PLAIN` ile söylenir); bilinmiyorsa undefined. */
  confidence?: ConfidenceLevel;
  /** Para/sağlayıcı/komut konuşan kart: yalnız yönetici modunda üretilir. */
  operatorOnly: boolean;
  /**
   * Kartın konusu (ör. çekilecek videonun adı): varsa ekranda büyük başlık olur, `title` küçük etiket kalır. Yoksa `title` başlıktır.
   * Metin kayıttan gelir (fikir başlığı), burada üretilmez.
   */
  subject?: string;
  /**
   * Kartın zamanı (ISO): yalnız zamanı olan kartlarda (`shoot_next`: planlanan yayın anı, `approve_publish`: planlanan yayın).
   * Ekran bunu dev saat olarak çizer; yoksa saat bloğu çizilmez (zamansız karta saat uydurulmaz).
   */
  dueAt?: string;
  /** Birincil eylem kapalıysa sebebi (ör. yayın açıklaması uyum denetiminden geçmiyor); kart sebebi gösterir. */
  blockedReason?: string;
}

// ---------------------------------------------------------------------- Söz

/** Sözün ikinci cümlesi: en güncel notların en güçlüsü (metin SON metindir; sayılar notta zaten yerleştirilmiş). */
export interface TodayVoiceNote {
  headline: string;
  text: string;
  confidence: ConfidenceLevel;
  evidence: BriefingEvidenceRef[];
  /** Notların üretildiği an (ISO). */
  generatedAt: string;
  /** Notlar bayatsa sebebi ve söylenecek düz cümle. */
  stale?: { reason: BriefingStaleReason; text: string };
}

export interface TodayVoice {
  /** Şablon cümle (kesin sayılar); hiçbir parça okunamadıysa undefined. */
  lead?: string;
  /** Şablon cümlenin bağlantısı ("Planı aç", "Hangileri?"). */
  link?: SummaryLink;
  note?: TodayVoiceNote;
}

// -------------------------------------------------------------------- Durum

/** Ekranın durumu: boş çalışma alanı · karar var · notlar bayat (karar yok) · karar yok. */
export type TodayStateKind = "empty" | "decisions" | "stale" | "clear";

export interface TodayState {
  kind: TodayStateKind;
  /** Durumun tek cümlesi (kuyruk boşken ekranın söylediği). */
  text: string;
}

export interface Today {
  state: TodayState;
  voice: TodayVoice;
  queue: DecisionCard[];
}
