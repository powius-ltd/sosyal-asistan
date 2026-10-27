/**
 * Plan geri beslemesi (kod, LLM yok): geçen haftaların plan yönlerinin sonucu (`WeekReview.directions`: tuttu/tutmadı) sonraki planın
 * yön puanına KÜÇÜK bir çarpan olarak girer. Kural (docs/FAZ2-KAPANIS-PLAN.md §2):
 *  - Son `FEEDBACK_WEEKS` haftada bir yönün (grup, değer) ≥ `FEEDBACK_MIN_N` ÖLÇÜLMÜŞ sonucu (tuttu + tutmadı) varsa
 *    çarpan = clamp(1 + 0,05·(tuttu − tutmadı), 0,85, 1,15); yoksa 1. "Ölçülemedi" sonuçlar sayıya girmez (undefined ≠ 0).
 *  - Gösterilen etki (`impact`) ham kalır; çarpan yalnız sıralama puanındadır. Gerekçeye "tuttu/tutmadı (n=…)" notu düşer.
 */
import type { DirectionReview } from "@/lib/domain/outcomes";
import { weekStartOf, type FocusSection } from "@/lib/domain/weekly-plan";
import { groupKeyId } from "@/lib/insights/groups";
import { REASON_PLAIN } from "@/lib/plain-language-plan";
import { DAY_MS } from "@/lib/time";

export const FEEDBACK_WEEKS = 4;
export const FEEDBACK_MIN_N = 2;
export const FEEDBACK_STEP = 0.05;
export const FEEDBACK_MIN = 0.85;
export const FEEDBACK_MAX = 1.15;

/** Bir haftanın plan yönü sonuçları (`WeekReview`'un geri beslemeye yetecek kısmı). */
export interface FeedbackReview {
  /** Gözden geçirilen planın haftası (Pazartesi, YYYY-MM-DD). */
  weekStart: string;
  directions: readonly DirectionReview[];
}

export interface DirectionFeedback {
  group: DirectionReview["group"];
  value: string;
  held: number;
  missed: number;
  /** Ölçülmüş sonuç sayısı = tuttu + tutmadı. */
  n: number;
  /** Puan çarpanı (n < `FEEDBACK_MIN_N` ise 1). */
  multiplier: number;
}

/** Anahtar `groupKeyId` (`grup:değer`). */
export type FeedbackIndex = ReadonlyMap<string, DirectionFeedback>;

export const EMPTY_FEEDBACK: FeedbackIndex = new Map();

/** Planın haftasından önceki `count` haftanın Pazartesileri (yakından uzağa): W−7, W−14, … Geçersiz gün → []. */
export function previousWeeks(weekStart: string, count: number = FEEDBACK_WEEKS): string[] {
  const aligned = weekStartOf(weekStart);
  if (aligned === undefined) return [];
  const base = Date.parse(`${aligned}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(base - (i + 1) * 7 * DAY_MS).toISOString().slice(0, 10));
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Çarpan kuralı tek yerde: ölçülmüş sonuç sayısı yetersizse 1. */
export function multiplierFor(held: number, missed: number): number {
  if (held + missed < FEEDBACK_MIN_N) return 1;
  return round2(clamp(1 + FEEDBACK_STEP * (held - missed), FEEDBACK_MIN, FEEDBACK_MAX));
}

/** Son `FEEDBACK_WEEKS` farklı haftanın yön sonuçlarını (grup, değer) başına toplar. */
export function buildFeedback(reviews: readonly FeedbackReview[]): FeedbackIndex {
  const recent = [...new Map(reviews.map((review) => [review.weekStart, review])).values()]
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .slice(0, FEEDBACK_WEEKS);
  const totals = new Map<string, { group: DirectionReview["group"]; value: string; held: number; missed: number }>();
  for (const review of recent) {
    for (const d of review.directions) {
      const id = groupKeyId(d);
      const entry = totals.get(id) ?? { group: d.group, value: d.value, held: 0, missed: 0 };
      entry.held += d.held;
      entry.missed += d.missed;
      totals.set(id, entry);
    }
  }
  const index = new Map<string, DirectionFeedback>();
  for (const [id, t] of totals) {
    const n = t.held + t.missed;
    if (n > 0) index.set(id, { ...t, n, multiplier: multiplierFor(t.held, t.missed) });
  }
  return index;
}

/** Sıralama puanı çarpanı; kayıt yoksa 1. */
export const feedbackMultiplier = (feedback: DirectionFeedback | undefined): number => feedback?.multiplier ?? 1;

/** Gerekçeye eklenen kısa Türkçe not; ölçülmüş sonuç yetersizse (n < 2) not yok. */
export function feedbackNote(feedback: DirectionFeedback | undefined): string | undefined {
  if (feedback === undefined || feedback.n < FEEDBACK_MIN_N) return undefined;
  const verdict = feedback.held > feedback.missed ? "tuttu" : feedback.missed > feedback.held ? "tutmadı" : "karışık sonuç verdi";
  return REASON_PLAIN.feedback(verdict, feedback.n, feedback.held, feedback.missed);
}

/**
 * Yön gerekçelerine geri bildirim notunu ekler (idempotent). `synthesize-week` gerekçeyi yeniden yazdığı için plan-run bunu
 * sentezden SONRA da çağırır: not LLM metnine bağlı kalmaz.
 */
export function applyFeedbackNotes(focus: FocusSection, feedback: FeedbackIndex): FocusSection {
  if (feedback.size === 0) return focus;
  return {
    ...focus,
    directions: focus.directions.map((direction) => {
      const note = feedbackNote(feedback.get(groupKeyId(direction)));
      if (note === undefined || direction.rationale?.includes(note)) return direction;
      return { ...direction, rationale: [direction.rationale, note].filter(Boolean).join(" ") };
    }),
  };
}
