/**
 * Haftalık içerik planı ("Bu hafta"): ne tuttu · bu hafta neye yüklen · 3–5 içerik · takvim · kaçın · geçen hafta.
 * Tablolar: `weekly_plans` + `weekly_plan_items` (+ `ideas`/`idea_evidence`); yazan `save_weekly_plan` RPC'si (service role).
 * Kurallar `docs/FAZ2-PLAN.md` §5: sayılabilen her şey düz kod (lib/insights), LLM yalnız gerekçe/metin; ölçülemeyen
 * değer `undefined` (0 değil); az örnekli yön "düşük güven" işaretiyle gelir.
 */
import type { Idea, RivalQuote } from "@/lib/domain/intel";
import type { CreativeBrief } from "@/lib/llm/creative-brief-schema";
import type { Platform } from "@/lib/platforms/types";

// --------------------------------------------------------------------- Güven

export type ConfidenceLevel = "high" | "medium" | "low";

export const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = ["high", "medium", "low"];

/** Güven eşikleri (örnek sayısı): ≥ 10 yüksek, ≥ 5 orta, aksi düşük. */
export const CONFIDENCE_HIGH_MIN_N = 10;
export const CONFIDENCE_MEDIUM_MIN_N = 5;

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "Yüksek güven",
  medium: "Orta güven",
  low: "Düşük güven",
};

/** Örnek sayısından güven düzeyi. Bilinmeyen/geçersiz sayı → düşük (0 örnek de düşük). */
export function confidenceForSample(n: number | undefined): ConfidenceLevel {
  if (n === undefined || !Number.isFinite(n)) return "low";
  if (n >= CONFIDENCE_HIGH_MIN_N) return "high";
  if (n >= CONFIDENCE_MEDIUM_MIN_N) return "medium";
  return "low";
}

/**
 * Baz çizgisi güven tavanı eşiği: bir gruptaki ÖLÇÜLMÜŞ videoların bu payı (≥ %50) baz çizgisi düşük güvenliyse
 * (`ContentScore.lowConfidence`: baz çizgisi < 10 içeriğe dayanıyor) grubun lift'i gürültülüdür → güven en çok orta olur.
 */
export const BASELINE_LOW_CONFIDENCE_CAP_SHARE = 0.5;

/**
 * Örnek sayısından gelen güveni (`confidenceForSample`) baz çizgisi kalitesiyle sınırlar: `lowConfidenceShare` ≥ %50 ise `high` →
 * `medium` (orta/düşük aynen kalır; tavan yalnız düşürür, hiçbir zaman yükseltmez). Pay ölçülemediyse (hiç ölçülmüş video ya da
 * baz çizgisi bilgisi yok) `undefined` → güven aynen kalır: bilinmeyen pay "düşük güvenli değil" demek değildir ama tavan için de
 * kanıt yoktur. Tek kural: hook-lift özetleri, içgörü grupları ve plan yönleri/adayları bunu kullanır.
 */
export function capConfidenceForBaseline(level: ConfidenceLevel, lowConfidenceShare: number | undefined): ConfidenceLevel {
  if (level !== "high" || lowConfidenceShare === undefined || !Number.isFinite(lowConfidenceShare)) return level;
  return lowConfidenceShare >= BASELINE_LOW_CONFIDENCE_CAP_SHARE ? "medium" : level;
}

// ----------------------------------------------------------------- Hafta günü

/** Haftada önerilen paylaşım sayısı sınırları (rakip medyan haftalık sıklığın yarısı, bu aralığa kırpılır). */
export const PLAN_POSTS_MIN = 3;
export const PLAN_POSTS_MAX = 5;

/** Takvim adedi: `clamp(round(rakip medyan haftalık / 2), 3, 5)`; rakip sıklığı ölçülemezse alt sınır. */
export function plannedPostCount(rivalMedianPostsPerWeek: number | undefined): number {
  if (rivalMedianPostsPerWeek === undefined || !Number.isFinite(rivalMedianPostsPerWeek)) return PLAN_POSTS_MIN;
  return Math.min(Math.max(Math.round(rivalMedianPostsPerWeek / 2), PLAN_POSTS_MIN), PLAN_POSTS_MAX);
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" → UTC gün başı (ms); geçersiz tarih (ör. 2026-02-31) → undefined. */
function dayKeyToUtcMs(dayKey: string): number | undefined {
  const match = DAY_KEY.exec(dayKey);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  return back.getUTCFullYear() === year && back.getUTCMonth() === month - 1 && back.getUTCDate() === day ? ms : undefined;
}

const utcMsToDayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Takvim gününün haftasının Pazartesi'si ("YYYY-MM-DD" → "YYYY-MM-DD"). Gün, çağıranın saat diliminde hesaplanmış
 * takvim günündür (`toDayKey`, `lib/format.ts`); hafta Pazartesi başlar (`weekly_plans.week_start` bunu zorlar).
 * Geçersiz gün → undefined.
 */
export function weekStartOf(dayKey: string): string | undefined {
  const ms = dayKeyToUtcMs(dayKey);
  if (ms === undefined) return undefined;
  const isoWeekday = (new Date(ms).getUTCDay() + 6) % 7; // Pzt = 0 … Paz = 6
  return utcMsToDayKey(ms - isoWeekday * 86_400_000);
}

/** Verilen günün Pazartesi olup olmadığı. */
export function isWeekStart(dayKey: string): boolean {
  const start = weekStartOf(dayKey);
  return start !== undefined && start === dayKey;
}

/** Haftanın 7 günü (Pzt → Paz); `weekStart` Pazartesi değilse önce haftasına hizalanır. Geçersiz gün → []. */
export function weekDayKeys(weekStart: string): string[] {
  const start = weekStartOf(weekStart);
  const ms = start === undefined ? undefined : dayKeyToUtcMs(start);
  return ms === undefined ? [] : Array.from({ length: 7 }, (_, i) => utcMsToDayKey(ms + i * 86_400_000));
}

// ------------------------------------------------------------------ Bölümler

/** Öneri/kaçın gruplama ekseni (`lib/insights`): hook türü, süre kovası, CTA türü ya da LLM konu kümesi. */
export type FocusGroup = "hook_type" | "duration_bucket" | "cta_type" | "topic_cluster";

export const FOCUS_GROUP_LABEL: Record<FocusGroup, string> = {
  hook_type: "Hook türü",
  duration_bucket: "Süre",
  cta_type: "CTA türü",
  topic_cluster: "Konu",
};

/** Tutan bir içerik ("ne tuttu"). */
export interface PlanWinner {
  contentItemId: string;
  /** İçeriğin sahibi ("@" yok). */
  ownerHandle: string;
  /** Kendi hesabın içeriği mi (false = rakip). */
  isOwn: boolean;
  lift: number;
  views?: number;
  publishedAt?: string;
  durationSec?: number;
  hookType?: string;
  /** İçerik analiz edildi mi (false: "neden tuttu" yok). */
  analyzed: boolean;
  /**
   * Analiz `ok` ama alıntı denetimi geçmedi (`evidenceVerified = false`): metin "kanıt doğrulanamadı" der, "henüz analiz edilmedi"
   * DEĞİL. Analiz hiç yoksa (`analyzed` false) bu alan undefined'dır.
   */
  evidenceUnverified?: boolean;
  /** "Neden tuttu" — LLM metni; alıntıya dayanır (`quote`). */
  why?: string;
  quote?: RivalQuote;
}

/** Bölüm 1 — Ne tuttu: rakip son 30 gün ≥ 3x (azsa ≥ 2x, işaretli) en çok 5; kendi son 90 gün ≥ 1,5x en çok 3. */
export interface WinnersSection {
  rivals: PlanWinner[];
  own: PlanWinner[];
  /** Rakip eşiği ≥ 3x'ten ≥ 2x'e gevşetildi (yeterli tutan yoktu). */
  relaxedThreshold: boolean;
  /** Veri yetmiyorsa sebep (boş liste "yok" demek değil). */
  unmeasuredReason?: string;
}

/** Bölüm 2 — Neye yüklen: puan = etki × yenilik; güven örnek sayısından. */
export interface FocusDirection {
  group: FocusGroup;
  /** Taksonomi anahtarı (hook türü, süre kovası, CTA türü) ya da küme adı. */
  value: string;
  /** Ekranda görünen Türkçe ad. */
  label: string;
  /** Grubun medyan lift'i ÷ 1 (baz); ölçülemediyse undefined. */
  impact?: number;
  /** Kendi hesap denemediyse 1,5; denediyse 1. */
  novelty: number;
  /** etki × yenilik (etki ölçülemediyse 0 değil: yön öne çıkarılmaz). */
  score: number;
  sampleSize: number;
  confidence: ConfidenceLevel;
  ownTried: boolean;
  /** Gerekçe metni (LLM; yalnız metin: alıntı `rationaleQuote`'ta ayrı durur, metne gömülmez). */
  rationale?: string;
  /** Gerekçeyi dayandıran kısa rakip alıntısı (kalıcı; yönün kanıt içeriklerinden biri, korpusta birebir doğrulanmış). */
  rationaleQuote?: RivalQuote;
  /** Yönü destekleyen içerikler. */
  evidenceContentIds: string[];
}

/**
 * Yön ref'i (`F1..Fn`): planın `focus.directions` sırasındaki yeri (1 tabanlı). Fikir üretimi yönleri bu sırayla numaralar ve fikrin
 * hizmet ettiği yönü (`Idea.directionRef`) böyle yazar; "Geçen hafta" hükmü aynı sırayla geri çözer. Tek kural burada.
 */
export const focusDirectionRef = (index: number): string => `F${index + 1}`;

/** `F2` → 1 (0 tabanlı sıra); biçim dışı/eksik ref → undefined. */
export function focusDirectionIndex(ref: string | undefined): number | undefined {
  const match = ref === undefined ? null : /^F([1-9]\d*)$/.exec(ref.trim());
  return match === null ? undefined : Number(match[1]) - 1;
}

export interface FocusSection {
  /** 2–3 yön, puana göre azalan. */
  directions: FocusDirection[];
  unmeasuredReason?: string;
}

/** Slotun dayanağı: kendi en iyi saat · kendi iyi saatleri · rakip sabit saati · rakip yaygın saati · varsayılan. */
export type SlotBasis = "own_best" | "own_good" | "rival_fixed" | "rival_common" | "default";

export const SLOT_BASIS_LABEL: Record<SlotBasis, string> = {
  own_best: "Kendi en iyi saatin",
  own_good: "Kendi iyi saatlerin",
  rival_fixed: "Rakiplerin sabit saati",
  rival_common: "Rakiplerin yaygın saati",
  default: "Varsayılan saat",
};

export interface ScheduleSlot {
  /** Plan öğesinin sırası (1..5). */
  position: number;
  /** Paylaşım anı (ISO, UTC). */
  at: string;
  /** Hedef kitle saat diliminde gün (Pzt = 0 … Paz = 6) ve saat (0–23). */
  weekday: number;
  hour: number;
  basis: SlotBasis;
  note?: string;
  ideaId?: string;
}

/** Bölüm 4 — Takvim: adet = clamp(rakip medyan haftalık / 2, 3, 5); saat hedef kitle diliminde (gösterim ET + İstanbul). */
export interface ScheduleSection {
  postsPerWeek: number;
  /** IANA dilim (`Workspace.audienceTimeZone`). */
  audienceTimeZone: string;
  slots: ScheduleSlot[];
  rivalMedianPostsPerWeek?: number;
  unmeasuredReason?: string;
}

/** Bölüm 5 — Kaçın: n ≥ 2 en düşük medyan lift'li gruplar + niş dışı. */
export interface AvoidEntry {
  kind: "low_lift" | "off_niche";
  group: FocusGroup | "off_niche";
  value: string;
  label: string;
  medianLift?: number;
  sampleSize: number;
  confidence: ConfidenceLevel;
  /** Kısa Türkçe gerekçe. */
  reason: string;
}

export interface AvoidSection {
  entries: AvoidEntry[];
}

/** Bölüm 6 — Geçen hafta: yayın sonrası ölçüm F3'te; şimdilik "yayın verisi bekleniyor". */
export interface ReviewSection {
  status: "awaiting_publish_data" | "available";
  note?: string;
}

export interface WeeklyPlanSections {
  winners: WinnersSection;
  focus: FocusSection;
  schedule: ScheduleSection;
  avoid: AvoidSection;
  review: ReviewSection;
}

/** Boş bölümler (kayıtlı bölüm biçimsizse okuma tarafı bunu döndürür; ekran "veri yok" der). */
export function emptyPlanSections(): WeeklyPlanSections {
  return {
    winners: { rivals: [], own: [], relaxedThreshold: false },
    focus: { directions: [] },
    schedule: { postsPerWeek: PLAN_POSTS_MIN, audienceTimeZone: "UTC", slots: [] },
    avoid: { entries: [] },
    review: { status: "awaiting_publish_data" },
  };
}

// --------------------------------------------------------------------- Plan

export type WeeklyPlanStatus = "draft" | "ready" | "archived";

export const WEEKLY_PLAN_STATUSES: readonly WeeklyPlanStatus[] = ["draft", "ready", "archived"];

export interface WeeklyPlanItem {
  ideaId: string;
  /** Plana girdi ise sıra (1..5); aday ise undefined. */
  position?: number;
  /** Önerilen paylaşım anı (ISO, UTC). */
  slotAt?: string;
  /** Slot gerekçesi (kısa Türkçe). */
  slotNote?: string;
  /** Fikrin doldurduğu Kreatif direktör brif slotu (`S1`..); brifsiz planda ve brifli planın dışındaki adayda undefined. Eski planlarda da undefined (0 değil). */
  briefSlot?: string;
  /** Fikir kartı: kanıtlar, hook'lar, script (`details`). */
  idea: Idea;
}

export interface WeeklyPlan {
  id: string;
  workspaceId: string;
  /** Plan hangi kendi hesap için (ses profili kaynağı); belirtilmediyse undefined. */
  accountId?: string;
  platform: Platform;
  /** Haftanın Pazartesi'si (YYYY-MM-DD). */
  weekStart: string;
  status: WeeklyPlanStatus;
  /** Planın kısa özeti (LLM). */
  summary?: string;
  /** Planın genel güveni (bölümlerin en zayıfı gibi; kodla belirlenir). */
  confidence?: ConfidenceLevel;
  sections: WeeklyPlanSections;
  /** Kreatif direktör brifi (tema, sütunlar, deneme değişkeni, slotlar; denetimden geçmiş). Brifsiz / eski planda undefined. */
  brief?: CreativeBrief;
  /** Plana girenler (3–5), sıraya göre artan. */
  items: WeeklyPlanItem[];
  /** Adaylar: üretildi ama plana alınmadı (sırasız; `rankScore`'a göre azalan). */
  alternatives: WeeklyPlanItem[];
  taxonomyVersion: string;
  promptVersion: string;
  model?: string;
  /** Planı üreten koşular (`collection_runs.id`). */
  runIds: string[];
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Plan listesi satırı (`listWeeklyPlans`): fikirleri yüklemeden geçmiş planları gösterir. */
export interface WeeklyPlanSummary {
  id: string;
  weekStart: string;
  status: WeeklyPlanStatus;
  confidence?: ConfidenceLevel;
  summary?: string;
  /** Plana giren içerik sayısı. */
  plannedCount: number;
  /** Plana girmeyen aday sayısı. */
  alternativeCount: number;
  generatedAt: string;
}
