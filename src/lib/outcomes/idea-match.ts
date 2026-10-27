/**
 * Fikir ↔ yayınlanan Reels otomatik eşleşme ÖNERİSİ (LLM yok, saf kod). Sonuç YALNIZ öneridir (`suggested`): sessiz bağ yok,
 * onay kullanıcıda.
 *
 * Skor = 0,6·metin + 0,4·zaman.
 *  - metin: `foldTurkish` kelime Jaccard'ı; Reels metinleri (açıklama, analiz hook'u) ↔ fikir metinleri (hook'lar, açıklama
 *    taslağı, başlık) çiftlerinin EN YÜKSEĞİ.
 *  - zaman: yayın, planlanan slota göre −12 sa … +48 sa içindeyse 1; bu aralığın dışında ±7 günde doğrusal 0'a iner. Slotu (ya da
 *    yayın tarihi) olmayan çift zaman puanı alamaz (0): yalnız güçlü metin eşleşmesi öneri üretir.
 * Eşik: skor ≥ 0,45 VE aynı Reels için ikinci en iyi fikirle fark ≥ 0,10. Reels başına en çok 1 öneri; fikir başına en çok 3.
 */
import { formatPercent } from "@/lib/format";
import { foldTurkish } from "@/lib/text";

export const MATCH_TEXT_WEIGHT = 0.6;
export const MATCH_TIME_WEIGHT = 0.4;
export const MATCH_MIN_SCORE = 0.45;
export const MATCH_MIN_MARGIN = 0.1;
export const MATCH_MAX_PER_IDEA = 3;

const HOUR_MS = 3_600_000;
/** Slot penceresi: bu aralıktaki yayın tam zaman puanı alır. */
const FULL_BEFORE_H = 12;
const FULL_AFTER_H = 48;
const ZERO_AT_H = 7 * 24;

/** Eşleşmeye giren fikir (bağlanabilir: reddedilmemiş, aktif bağı yok). */
export interface MatchIdea {
  id: string;
  title: string;
  hooks: readonly string[];
  captionDraft?: string;
  /** Planlanan paylaşım anı (ISO; plan slotu). */
  plannedAt?: string;
}

/** Eşleşmeye giren Reels (kendi hesap, kısa kodlu). */
export interface MatchReel {
  contentItemId: string;
  shortcode: string;
  caption?: string;
  /** Analizin hook alıntısı (varsa). */
  hookText?: string;
  publishedAt?: string;
}

export interface MatchSuggestion {
  ideaId: string;
  contentItemId: string;
  shortcode: string;
  /** 0..1 (0,6·metin + 0,4·zaman). */
  score: number;
  textScore: number;
  timeScore: number;
  /** Kısa Türkçe gerekçeler. */
  reasons: string[];
}

// Eşleşmeyi şişiren bağlaçlar: kısa Türkçe ve İngilizce dolgu sözcükleri (katlanmış biçim).
const STOPWORDS = new Set([
  "ve", "ile", "bir", "bu", "su", "icin", "gibi", "ama", "daha", "cok", "mi", "de", "da", "ne", "ben", "sen", "biz", "siz",
  "the", "and", "for", "you", "your", "are", "with", "that", "this", "have", "not", "but", "from", "was", "can", "all",
]);

/** Katlanmış sözcük kümesi (≥ 3 harf, dolgu sözcükleri atılır); '#' etiketleri sözcüktür. */
export function wordSet(text: string | undefined): Set<string> {
  if (text === undefined) return new Set();
  const words = foldTurkish(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.filter((word) => word.length >= 3 && !STOPWORDS.has(word)));
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Metin puanı: Reels metinleri × fikir metinleri çiftlerinin en yükseği (0..1). */
export function textScore(idea: MatchIdea, reel: MatchReel): number {
  const reelSets = [reel.caption, reel.hookText].map(wordSet).filter((s) => s.size > 0);
  const ideaSets = [...idea.hooks, idea.captionDraft, idea.title].map(wordSet).filter((s) => s.size > 0);
  let best = 0;
  for (const r of reelSets) for (const i of ideaSets) best = Math.max(best, jaccard(r, i));
  return best;
}

/** Zaman puanı: slot −12 sa … +48 sa içinde 1; dışında ±7 günde doğrusal 0. Slot/yayın tarihi yoksa 0. */
export function timeScore(plannedAt: string | undefined, publishedAt: string | undefined): number {
  const planned = plannedAt === undefined ? Number.NaN : Date.parse(plannedAt);
  const published = publishedAt === undefined ? Number.NaN : Date.parse(publishedAt);
  if (Number.isNaN(planned) || Number.isNaN(published)) return 0;
  const deltaH = (published - planned) / HOUR_MS;
  if (deltaH >= -FULL_BEFORE_H && deltaH <= FULL_AFTER_H) return 1;
  if (deltaH > FULL_AFTER_H) return Math.max(0, (ZERO_AT_H - deltaH) / (ZERO_AT_H - FULL_AFTER_H));
  return Math.max(0, (ZERO_AT_H + deltaH) / (ZERO_AT_H - FULL_BEFORE_H));
}

function reasonsFor(text: number, time: number, idea: MatchIdea, reel: MatchReel): string[] {
  const reasons: string[] = [];
  if (text > 0) reasons.push(`Metin benzerliği ${formatPercent(text, 0) ?? "?"}`);
  if (time > 0 && idea.plannedAt !== undefined && reel.publishedAt !== undefined) {
    const hours = Math.round((Date.parse(reel.publishedAt) - Date.parse(idea.plannedAt)) / HOUR_MS);
    reasons.push(`Yayın, planlanan saate ${hours >= 0 ? `${hours} sa sonra` : `${-hours} sa önce`}`);
  }
  return reasons;
}

/**
 * Öneriler. Girdi zaten süzülmüştür (çağıran): fikirler bağlanabilir, Reels'ler başka fikre onaylı değil, `excludedPairs`
 * (`ideaId|shortcode`) daha önce bağlanmış/reddedilmiş çiftlerdir (aynı çift tekrar önerilmez).
 */
export function suggestMatches(
  ideas: readonly MatchIdea[],
  reels: readonly MatchReel[],
  excludedPairs: ReadonlySet<string> = new Set(),
): MatchSuggestion[] {
  const winners: MatchSuggestion[] = [];
  for (const reel of reels) {
    const scored = ideas
      .filter((idea) => !excludedPairs.has(`${idea.id}|${reel.shortcode}`))
      .map((idea): MatchSuggestion => {
        const text = textScore(idea, reel);
        const time = timeScore(idea.plannedAt, reel.publishedAt);
        return {
          ideaId: idea.id,
          contentItemId: reel.contentItemId,
          shortcode: reel.shortcode,
          score: MATCH_TEXT_WEIGHT * text + MATCH_TIME_WEIGHT * time,
          textScore: text,
          timeScore: time,
          reasons: reasonsFor(text, time, idea, reel),
        };
      })
      .sort((a, b) => b.score - a.score || a.ideaId.localeCompare(b.ideaId));

    const [best, second] = scored;
    if (best === undefined || best.score < MATCH_MIN_SCORE) continue;
    // Küçük kayan nokta farkı sınırı bozmasın: 0,10 fark tam sınırdadır.
    if (second !== undefined && best.score - second.score < MATCH_MIN_MARGIN - 1e-9) continue;
    winners.push(best);
  }

  // Fikir başına en çok 3 öneri (en yüksek skorlular).
  const perIdea = new Map<string, MatchSuggestion[]>();
  for (const winner of winners) perIdea.set(winner.ideaId, [...(perIdea.get(winner.ideaId) ?? []), winner]);
  return [...perIdea.values()].flatMap((list) => list.sort((a, b) => b.score - a.score || a.shortcode.localeCompare(b.shortcode)).slice(0, MATCH_MAX_PER_IDEA));
}
