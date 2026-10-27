/**
 * Konu kataloğunun tek giriş noktası + katalogdan metin üreten küçük yardımcılar.
 */
import type { HookSpec, Topic } from "@/lib/data/mock/catalog/topic-types";
import { TOOL_TOPICS } from "@/lib/data/mock/catalog/topics-tools";
import { WORK_TOPICS } from "@/lib/data/mock/catalog/topics-work";

export const TOPICS: readonly Topic[] = [...WORK_TOPICS, ...TOOL_TOPICS];

export function topicByKey(key: string): Topic {
  const topic = TOPICS.find((t) => t.key === key);
  if (!topic) throw new Error(`mock katalog: konu yok: ${key}`);
  return topic;
}

const VIDEO_EMOJI = ["👇", "⚡", "🤖", "✅", "🧠", "⏱️"] as const;

/** Kısa video altyazısı: hook + emoji + hashtag'ler. */
export function videoCaption(topic: Topic, hook: HookSpec, emojiIndex: number): string {
  const emoji = VIDEO_EMOJI[emojiIndex % VIDEO_EMOJI.length];
  return `${hook.text} ${emoji} ${topic.hashtags.map((h) => `#${h}`).join(" ")}`;
}

/** Karusel/görsel altyazısı: kaydetmeye yönelik rehber dili. */
export function postCaption(topic: Topic, carousel: boolean): string {
  const lead = carousel ? `Kaydet: adım adım ${topic.label} rehberi 📌` : `Tek görselde ${topic.label} özeti 📌`;
  return `${lead} ${topic.body[1]} ${topic.hashtags.map((h) => `#${h}`).join(" ")}`;
}
