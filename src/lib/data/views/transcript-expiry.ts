/**
 * Rakip transcript'inin 90 günlük saklama kuralı (AGENTS.md şasi kuralları), okuma tarafı. `purge_expired_transcripts` (0003) metni fiilen
 * siler; ama o bir zamanlayıcı/betik işidir ve çalışmamış olabilir: süresi dolan transcript'in metni, purge beklenmeden okumada da
 * görünmez. `expiresAt` yoksa süresizdir (kendi içeriğin transcript'i). Mock ve Supabase deposu aynı kuralı buradan alır.
 */
import type { Transcript } from "@/lib/domain/intel";

/** `expiresAt` ≤ now → süresi dolmuş (DB purge koşulu `expires_at <= p_now` ile aynı). */
export function isTranscriptExpired(transcript: Pick<Transcript, "expiresAt">, now: Date): boolean {
  if (transcript.expiresAt === undefined) return false;
  const expires = Date.parse(transcript.expiresAt);
  return Number.isFinite(expires) && expires <= now.getTime();
}

/** Süresi dolmuşsa metin ve segmentler atılır (satır kalır: "süresi doldu" gösterimi); değilse olduğu gibi. */
export function maskExpiredTranscript(transcript: Transcript, now: Date): Transcript {
  if (!isTranscriptExpired(transcript, now)) return transcript;
  return { ...transcript, text: undefined, segments: undefined };
}
