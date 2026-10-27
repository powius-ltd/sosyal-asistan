/**
 * AI'ın üstteki sözü: ilk cümle şablon (kesin sayılar; Genel bakış özetinin satırlarından), ikinci cümle en güncel notların en güçlüsü.
 * Saf: LLM çağrısı yok, notun metni zaten doğrulanmış SON metindir. Ölçülemeyen değer cümleye girmez (özet satırları düşürür; 0 yazılmaz).
 * Hesap/marka adı gömülmez.
 */
import { briefingFreshness, type BriefingItem, type BriefingStaleReason } from "@/lib/domain/briefing";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";
import { buildOverviewSummary } from "@/lib/overview/summary";
import { PLAIN_TERMS } from "@/lib/plain-language";
import type { TodayInput, TodayVoice, TodayVoiceNote } from "@/lib/today/types";

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 2, medium: 1, low: 0 };

const capitalize = (text: string) => (text === "" ? text : text[0].toLocaleUpperCase("tr-TR") + text.slice(1));

/** Bayat notların düz cümlesi (sözlükten): yeni veri geldiyse "güncelleyeceğim", yalnız eskiyse "eski veriye dayanıyor". */
export const STALE_NOTE_TEXT: Record<BriefingStaleReason, string> = {
  new_data: `${capitalize(PLAIN_TERMS.stale.say)}.`,
  too_old: PLAIN_TERMS.stale.meaning,
};

/** En güçlü not: güveni en yüksek madde; eşitlikte Analist'in sırası (ilk gelen). */
export function strongestBriefingItem(items: readonly BriefingItem[]): BriefingItem | undefined {
  let best: BriefingItem | undefined;
  for (const item of items) {
    if (best === undefined || CONFIDENCE_RANK[item.confidence] > CONFIDENCE_RANK[best.confidence]) best = item;
  }
  return best;
}

function voiceNote(input: TodayInput): TodayVoiceNote | undefined {
  const { briefing } = input;
  if (!briefing) return undefined;
  const item = strongestBriefingItem(briefing.items);
  if (!item || item.body.trim() === "") return undefined;
  const freshness = briefingFreshness(briefing.generatedAt, { now: input.now, lastCollectedAt: input.summary.lastCollectedAt });
  return {
    headline: item.headline,
    text: item.body,
    confidence: item.confidence,
    evidence: item.evidence,
    generatedAt: briefing.generatedAt,
    stale: freshness.stale ? { reason: freshness.reason, text: STALE_NOTE_TEXT[freshness.reason] } : undefined,
  };
}

/**
 * Söz: boş çalışma alanında yalnız ilk-bakış cümlesi (not yok). Aksi halde ilk cümle "bu hafta ne yaptım" (yoksa "neredeyiz"),
 * ikinci cümle en güçlü not. İkisi de yoksa boş söz döner (ekran yalnız durumu söyler).
 */
export function buildTodayVoice(input: TodayInput): TodayVoice {
  const summary = buildOverviewSummary(input.summary);
  if (summary.empty) return { lead: summary.where?.text };
  const line = summary.done ?? summary.where;
  return { lead: line?.text, link: line?.link, note: voiceNote(input) };
}
