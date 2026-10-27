/**
 * Aktörün altyazı/transcript alanından düz metin. `includeTranscript: true` ile gelen alanın biçimi
 * DOĞRULANMAMIŞTIR (2026-09-30 fixture koşusu `includeTranscript: false` idi, ücretli ek özellik) —
 * bu yüzden bilinen üç biçim denenir (düz metin, `{ text | plaintext | srt | vtt | content }`, bunların dizisi);
 * hiçbiri tutmazsa alan hiç yazılmaz. Transcript 90 gün sonra silinir (`expires_at`, PLAN.md uyum kuralları).
 */
import { asRecord, firstDefined, type RawItem } from "@/lib/platforms/_shared/field-pick";

const TEXT_KEYS = ["plaintext", "text", "srt", "vtt", "content"] as const;

function textOf(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() !== "" ? value : undefined;
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of TEXT_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  }
  return undefined;
}

export function pickTranscript(item: RawItem): string | undefined {
  const raw = firstDefined(item, ["transcript", "subtitles", "captions"]);
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const text = textOf(entry);
      if (text) return text;
    }
    return undefined;
  }
  return textOf(raw);
}
