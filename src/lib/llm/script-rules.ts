/**
 * Senaryo metni kuralları (saf; LLM ve DB yok): fikir doğrulaması (`generate-ideas-validate.ts`) ve senaryo editörü denetimi
 * (`script-review-validate.ts`) AYNI kuralları buradan kullanır; kopya yazılmaz.
 *  - Kopya engeli: üretilen metin ile havuzdaki HER rakip metni arasındaki en uzun ortak kelime dizisi < `COPY_WORD_LIMIT`.
 *  - Dil: `en` içerikte Türkçe'ye özgü harf (ğ ş ı İ) yok.
 */
import type { ContentLanguage } from "@/lib/domain/content-language";
import { longestSharedWordRun } from "@/lib/intel/normalize";

/** Rakip metniyle bu kadar ya da daha uzun ortak kelime dizisi = kopya. */
export const COPY_WORD_LIMIT = 8;

/** İngilizce içerikte bulunmaması gereken harfler (ö ü ç yabancı sözcüklerde geçebilir; bunlar yalnız Türkçe'de beklenir). */
const TURKISH_ONLY = /[ğĞşŞıİ]/u;

/** Kopya denetimi için bir rakip metin parçası (kanallar birleştirilmez: her biri ayrı). */
export interface RivalText {
  id: string;
  text: string;
}

/** Rakip metin kanalları taşıyan içerik (kendi içerik `isOwn` ise atlanır). */
export interface RivalTextSource {
  id: string;
  isOwn: boolean;
  transcript?: string;
  screenText?: string;
  caption?: string;
  hookText?: string;
}

export function rivalTexts(evidence: Iterable<RivalTextSource>): RivalText[] {
  const parts: RivalText[] = [];
  for (const content of evidence) {
    if (content.isOwn) continue;
    for (const text of [content.transcript, content.screenText, content.caption, content.hookText]) if (text !== undefined && text.trim() !== "") parts.push({ id: content.id, text });
  }
  return parts;
}

/** Üretilen metinlerin HER rakip metniyle en uzun ortak kelime dizisi (ve en çok paylaşılan rakip içeriği). */
export function maxSharedWithRivals(produced: readonly string[], rivals: readonly RivalText[]): { maxSharedWords: number; copiedFrom?: string } {
  let maxSharedWords = 0;
  let copiedFrom: string | undefined;
  for (const rival of rivals) {
    for (const text of produced) {
      const run = longestSharedWordRun(text, rival.text);
      if (run > maxSharedWords) {
        maxSharedWords = run;
        copiedFrom = rival.id;
      }
    }
  }
  return { maxSharedWords, copiedFrom };
}

/** `en` içerikte Türkçe'ye özgü harf var mı. */
export const hasTurkishOnlyLetters = (language: ContentLanguage, texts: readonly string[]): boolean => language === "en" && texts.some((text) => TURKISH_ONLY.test(text));
