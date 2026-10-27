/**
 * Mock üreteç parçası — Faz 2 zeka katmanı v2: video analizinin yeni alanları (hook kanalı, kurgu ölçümleri, alıntı denetim raporu)
 * ve konu eleği sonuçları (`content_topic_screens`). `generators/intel.ts` kullanır. Rastgelelik AYRI akıştan (`fork`) gelir:
 * mevcut transcript/analiz çekilişleri kaymaz, eski mock veri aynı kalır. Amaç, ekranların yeni alanları mock'ta gösterebilmesi:
 * ölçülemeyen (`undefined`) kurgu ölçümü, kısmen ölçülmüş kurgu, doğrulanamayan alıntı raporu, niş dışı içerik.
 */
import type { ContentItem } from "@/lib/domain/content";
import type { ContentTopicScreen, EditMetrics, EvidenceCheck, EvidenceChannel, EvidenceReport, HookSource, TranscriptSegment } from "@/lib/domain/intel";
import { topicByKey } from "@/lib/data/mock/catalog/topics";
import type { ContentMeta } from "@/lib/data/mock/generators/content";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import type { Rng } from "@/lib/data/mock/prng";

export const SCREEN_PROMPT_VERSION = "screen-topics-v1";
export const SCREEN_MODEL = "claude-mock";
/** Video analizinin arka ucu ve modeli (yeni analizler; eski Faz 1 analizlerinde bu alanlar yoktur). */
export const AGY_MODEL = "gemini-3.8-flash-medium";
export const VIDEO_PROMPT_VERSION = "video-analysis-2026-10-v1";

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Hook kanalı: çoğu konuşma; birkaçı ekran yazısı/açıklama (konuşmasız video). */
export function pickHookSource(rng: Rng): HookSource {
  return rng.weighted<HookSource>([["speech", 0.86], ["screen_text", 0.09], ["caption", 0.05]]);
}

/**
 * Kurgu ölçümleri. Ölçülemeyen alan YAZILMAZ (`undefined ≠ 0`): süresi bilinmeyen video hiç ölçülemez; bir kısmında yalnız
 * görsel/ses özellikleri ölçülür (kesme sayımı yok); kalanında hepsi.
 */
export function buildEditMetrics(rng: Rng, durationSec: number | undefined): EditMetrics | undefined {
  if (durationSec === undefined || durationSec <= 0) return undefined;
  const roll = rng.next();
  if (roll < 0.15) return undefined;
  const base: EditMetrics = { onCameraSpeaker: rng.chance(0.7), hasMusic: rng.chance(0.6), hasBurnedCaptions: rng.chance(0.5) };
  if (roll < 0.3) return base;
  const cutCount = rng.int(Math.max(3, Math.round(durationSec / 6)), Math.max(6, Math.round(durationSec / 1.5)));
  const cutsPerMinute = round1((cutCount / durationSec) * 60);
  return {
    ...base,
    cutCount,
    avgShotSec: round1(durationSec / (cutCount + 1)),
    cutsPerMinute,
    tempo: cutsPerMinute < 12 ? "slow" : cutsPerMinute < 28 ? "medium" : "fast",
    onScreenTextCount: rng.int(0, 7),
  };
}

/**
 * Transcript parçaları (kanallı): konuşma cümleleri + ölçülen adet (`onScreenTextCount`) kadar ekran yazısı (başlık kartı gibi:
 * cümlenin ilk kelimeleri, büyük harf). Süreye orantılı zaman; rastgelelik YOK (akış kaymaz). Ekran yazısı konuşmanın altyazısı
 * değildir, ayrı bir kanaldır.
 */
export function buildSegments(text: string, durationSec: number | undefined, screenCount: number): TranscriptSegment[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim() !== "");
  if (sentences.length === 0) return [];
  const total = durationSec !== undefined && durationSec > 0 ? durationSec : Math.max(10, sentences.length * 4);
  const at = (index: number, of: number) => round1((index / of) * total);
  const speech = sentences.map((sentence, i): TranscriptSegment => ({ startSec: at(i, sentences.length), endSec: at(i + 1, sentences.length), text: sentence, channel: "speech" }));
  const screen = sentences.slice(0, Math.max(0, screenCount)).map(
    (sentence, i): TranscriptSegment => ({ startSec: at(i, sentences.length) + 0.5, text: sentence.split(/\s+/).slice(0, 4).join(" ").replace(/[.!?,]+$/, "").toLocaleUpperCase("tr-TR"), channel: "screen" }),
  );
  return [...speech, ...screen].sort((a, b) => a.startSec - b.startSec || (a.channel === "speech" ? -1 : 1));
}

export interface QuoteCheckInput {
  target: EvidenceCheck["target"];
  key?: string;
  quote: string;
}

/**
 * Alıntı denetim raporu: her alıntı transkriptte aranır (mock korpusu = transcript); bulunamayan alıntı `failures`'a girer.
 * `verified`, analizin `evidenceVerified`'ı ile AYNI denetimden çıkar (iki ayrı hesap yok). Hook'un bulunduğu kanal `hookSource`.
 */
export function buildEvidenceReport(text: string, wordCount: number, hookSource: HookSource, inputs: readonly QuoteCheckInput[]): EvidenceReport {
  const checks = inputs.map((input): EvidenceCheck => {
    const found = text.includes(input.quote);
    const channel: EvidenceChannel | undefined = found ? (input.target === "hook" ? hookSource : "speech") : undefined;
    return { ...input, found, ...(channel ? { channel } : { failure: "not_found" as const }) };
  });
  const failures = checks.filter((check) => !check.found);
  return {
    verified: failures.length === 0,
    corpusWords: wordCount,
    insufficientData: false,
    hookChannel: failures.some((check) => check.target === "hook") ? undefined : hookSource,
    checked: checks.length,
    passed: checks.length - failures.length,
    failures,
  };
}

/** Yalnız müzik/efekt: konuşma yok → korpus çok kısa, denetim yapılmaz (`insufficient_data`). */
export function insufficientEvidenceReport(wordCount: number): EvidenceReport {
  return { verified: false, corpusWords: wordCount, insufficientData: true, checked: 0, passed: 0, failures: [] };
}

// --------------------------------------------------------------- Konu eleği

/** Niş dışı içeriği olan rakip ("evelyn benzeri": kendi nişi dışında da paylaşan hesap). */
const OFF_NICHE_HANDLE = "girisimci.ai";
const OFF_NICHE_TOPICS = [
  { topic: "Günlük yaşam vlogu", reason: "Ana konu günlük yaşam kesiti; yapay zekâ, otomasyon ya da verimlilik yok." },
  { topic: "Girişimcilik motivasyonu", reason: "Yalnız motivasyon sözü; somut bir araç ya da yöntem anlatılmıyor." },
  { topic: "Ürün tanıtımı", reason: "Sponsorlu ürün tanıtımı; nişin konusu olan bir iş akışı yok." },
] as const;

/**
 * Konu eleği sonuçları: analiz edilen (seçilen) her içerik niş içi sayılır ve katalog konusuyla etiketlenir; ayrıca rakibin birkaç
 * analiz edilmemiş videosu niş dışı bulunur (elenen içerik analiz kuyruğuna girmez, tutan olsa da plana örnek alınmaz: en yüksek
 * liftli olanı bilerek içerir). Elek sonucu olmayan içerik "elenmedi"dir, niş içi değil.
 */
export function buildTopicScreens(
  rng: Rng,
  clock: MockClock,
  picked: readonly ContentItem[],
  items: readonly ContentItem[],
  meta: ReadonlyMap<string, ContentMeta>,
): ContentTopicScreen[] {
  const pickedIds = new Set(picked.map((item) => item.id));
  const screens: ContentTopicScreen[] = [];
  const base = { promptVersion: SCREEN_PROMPT_VERSION, model: SCREEN_MODEL };

  picked.forEach((item, k) => {
    const m = meta.get(item.id);
    if (!m) return;
    const topic = topicByKey(m.topicKey);
    screens.push({
      contentItemId: item.id,
      inNiche: true,
      topic: topic.label,
      reason: `Açıklama ve açılış "${topic.label}" konusunu işliyor; nişle uyumlu.`,
      ...base,
      screenedAt: clock.daysAgo(1.8 - k * 0.001),
    });
  });

  const candidates = items
    .filter((c) => c.format === "short_video" && c.owner.kind === "competitor" && c.owner.handle === OFF_NICHE_HANDLE && !pickedIds.has(c.id) && !c.score.immature)
    .sort((a, b) => (b.score.lift ?? 0) - (a.score.lift ?? 0) || (a.id < b.id ? -1 : 1));
  // En yüksek liftli + iki rastgele düşük liftli: niş dışı içerik hem "tutmuş" hem "tutmamış" olabilir.
  const low = rng.shuffle(candidates.slice(1));
  [...candidates.slice(0, 1), ...low.slice(0, OFF_NICHE_TOPICS.length - 1)].forEach((item, i) => {
    const { topic, reason } = OFF_NICHE_TOPICS[i];
    screens.push({ contentItemId: item.id, inNiche: false, topic, reason, ...base, screenedAt: clock.daysAgo(1.7) });
  });
  return screens;
}
