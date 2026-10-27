/**
 * Viral av konu sorguları (SAF): niş özeti + kendi tutan konu kümeleri + en sık etiketler → en çok `VIRAL_MAX_TOPICS` konu.
 * Elle verilen konular (`--konu=`) her zaman önce gelir. Platforma özel biçim (IG anahtar sözcük, TikTok tek sözcük etiket) platform
 * modülünün işidir; burada yalnız düz konu metni üretilir.
 */
import { foldTurkish } from "@/lib/text";
import { VIRAL_MAX_TOPICS } from "@/lib/viral/thresholds";

export type ViralTopicSource = "manual" | "niche" | "cluster" | "hashtag";

export interface ViralTopic {
  /** Düz konu metni (küçük harf, # yok, 2–40 karakter). */
  query: string;
  source: ViralTopicSource;
}

export interface ViralQuerySources {
  manual?: readonly string[];
  /** Kendi içeriğin konu kümeleri (etiket + kaç içerik). */
  clusters?: readonly { label: string; count: number }[];
  /** Kendi içeriklerinin etiketleri (içerik başına liste). */
  hashtags?: readonly (readonly string[])[];
  nicheBrief?: string | null;
}

const TOPIC_MIN = 2;
const TOPIC_MAX = 40;
/** Konu olamayacak kadar genel etiketler (her videoda geçer; patlamış video aramasına anlam katmaz). */
const GENERIC_TAGS = new Set(["reels", "reel", "fyp", "foryou", "foryoupage", "viral", "kesfet", "keşfet", "explore", "instagram", "tiktok", "trend", "video", "shorts", "ig", "tiktoktürkiye", "tiktokturkiye"]);
/** Niş özetinden konu çıkarırken atlanan sık sözcükler. */
const STOP_WORDS = new Set(["ve", "ile", "için", "icin", "bir", "bu", "şu", "su", "o", "da", "de", "ki", "mi", "mı", "mu", "mü", "olan", "gibi", "daha", "çok", "cok", "the", "and", "for", "with", "a", "an", "of", "to", "in", "on", "hesap", "sayfa", "içerik", "icerik", "paylaşım", "paylasim", "video", "videolar"]);

/** Konu metnini temizler: # ve noktalama atılır, küçük harf (Türkçe kurallı), boşluklar tekleşir; uzunluk dışıysa `undefined`. */
export function cleanTopic(raw: string): string | undefined {
  const text = raw
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length >= TOPIC_MIN && text.length <= TOPIC_MAX ? text : undefined;
}

/** Niş özetinin ilk cümlesinden en çok 4 anlamlı sözcük ("Evde kahve demleme üzerine kısa videolar…" → "evde kahve demleme"). */
export function nicheTopic(brief: string | null | undefined): string | undefined {
  const sentence = (brief ?? "").split(/[.!?;\n]/)[0] ?? "";
  const words = sentence
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word, index, all) => word.length >= 3 && !STOP_WORDS.has(word) && all.indexOf(word) === index)
    .slice(0, 4);
  return cleanTopic(words.join(" "));
}

function topHashtags(lists: readonly (readonly string[])[]): string[] {
  const counts = new Map<string, number>();
  for (const list of lists) {
    // Aynı içerikte tekrar sayılmaz.
    for (const key of new Set(list.map((tag) => cleanTopic(tag) ?? ""))) {
      if (key === "" || GENERIC_TAGS.has(key) || key.includes(" ")) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr")).map(([tag]) => tag);
}

export function buildViralTopics(sources: ViralQuerySources, max: number = VIRAL_MAX_TOPICS): ViralTopic[] {
  const picked: ViralTopic[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined, source: ViralTopicSource): void => {
    if (picked.length >= max || raw === undefined) return;
    const query = cleanTopic(raw);
    if (query === undefined) return;
    const key = foldTurkish(query);
    if (seen.has(key)) return;
    seen.add(key);
    picked.push({ query, source });
  };

  for (const topic of sources.manual ?? []) add(topic, "manual");
  add(nicheTopic(sources.nicheBrief), "niche");
  const clusters = [...(sources.clusters ?? [])].filter((cluster) => cluster.count > 0).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "tr"));
  for (const cluster of clusters) add(cluster.label, "cluster");
  for (const tag of topHashtags(sources.hashtags ?? [])) add(tag, "hashtag");
  return picked;
}
