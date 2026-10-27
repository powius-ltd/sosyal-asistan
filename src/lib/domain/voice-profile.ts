/**
 * Marka sesi profili: kendi hesabın nasıl konuştuğu (script üretimine girdi; "Ornek'in sesinde"). Tablo: `voice_profiles`
 * (hesap başına tek GÜNCEL profil). Özellikler kendi transcript'lerinden birebir alıntıyla desteklenir; sayısal ön
 * istatistik (`VoiceStats`) LLM'siz, açıklama/metin verisinden hesaplanır (`lib/insights`). Ölçülemeyen alan `undefined` (0 değil).
 */
import type { Platform } from "@/lib/platforms/types";

/** Bir özelliğin dayanağı: kendi videodan kısa birebir alıntı. */
export interface VoiceExample {
  contentItemId: string;
  quote: string;
}

export interface VoiceTrait {
  /** Kararlı anahtar (ör. "direct-address"); fikir `details.voiceTraitKeys` buna bağlanır. */
  key: string;
  /** Ekranda görünen Türkçe ad. */
  label: string;
  /** Özelliğin kısa açıklaması. */
  description: string;
  /** Alıntıları korpusta doğrulandı mı (`lib/intel/evidence.ts`); doğrulanmayan özellik script'e girmez. */
  verified: boolean;
  examples: VoiceExample[];
}

export interface VoiceLexicon {
  /** İmza ifadeler (sık kullanılan kalıplar). */
  signaturePhrases: string[];
  /** Kaçınılacak ifadeler/kelimeler (sesine uymayan). */
  avoidPhrases: string[];
}

/** Metin verisinden deterministik ön istatistik. Hesaba giren video sayısı `sampleSize`'dadır. */
export interface VoiceStats {
  /** İstatistiğe giren video sayısı. */
  sampleSize: number;
  medianCaptionChars?: number;
  /** Açıklamada soru işareti olan videoların payı (0..1). */
  questionShare?: number;
  /** Açıklama başına ortalama emoji sayısı. */
  emojiPerCaption?: number;
  /** Video başına medyan hashtag sayısı. */
  medianHashtagCount?: number;
  /** "you/your" · "sen/senin" gibi ikinci tekil kişi kullanan açıklamaların payı (0..1). */
  secondPersonShare?: number;
  /** Ortalama cümle uzunluğu (kelime); transcript varsa. */
  avgSentenceWords?: number;
  medianDurationSec?: number;
}

/** Ses profilinin script üretimine girmesi için gereken en az doğrulanmış özellik sayısı (kabul testi: ≥ 5). */
export const VOICE_MIN_VERIFIED_TRAITS = 5;

export interface VoiceProfile {
  id: string;
  workspaceId: string;
  /** Profilin ait olduğu kendi hesap (`social_accounts.id`). */
  accountId: string;
  platform: Platform;
  /** İçerik dili (ISO); bilinmiyorsa undefined. */
  language?: string;
  /** 1–3 cümlelik ses özeti. */
  summary: string;
  traits: VoiceTrait[];
  lexicon: VoiceLexicon;
  stats: VoiceStats;
  /** Profili çıkarmak için okunan video sayısı. */
  sampleSize: number;
  taxonomyVersion: string;
  promptVersion: string;
  model?: string;
  generatedAt: string;
}

/** Yalnız doğrulanmış özellikler (script'e girebilenler). */
export function verifiedTraits(profile: Pick<VoiceProfile, "traits">): VoiceTrait[] {
  return profile.traits.filter((trait) => trait.verified);
}

/** Profil script üretimi için yeterli mi (≥ `VOICE_MIN_VERIFIED_TRAITS` doğrulanmış özellik). */
export function isVoiceProfileUsable(profile: Pick<VoiceProfile, "traits"> | null | undefined): boolean {
  return profile !== null && profile !== undefined && verifiedTraits(profile).length >= VOICE_MIN_VERIFIED_TRAITS;
}

/** Boş lexicon (kayıtlı alan biçimsizse okuma tarafı bunu döndürür). */
export function emptyLexicon(): VoiceLexicon {
  return { signaturePhrases: [], avoidPhrases: [] };
}
