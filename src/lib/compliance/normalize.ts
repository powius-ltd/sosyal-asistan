/**
 * Metin normalizasyonu (Türkçe İ/ı duyarlı). Kullanıcı "REKLAM", "TANITIM", "TANİTİM" ya da "Tanıtım" yazabilir;
 * hepsi aynı biçime iner (`foldTurkish`, `lib/text.ts`'te tek yerde).
 */
import { foldTurkish } from "@/lib/text";

export { foldTurkish };

/**
 * İbare penceresi: "Reklam"/"Tanıtım"/"#ad" ibaresi açıklamanın İLK bu kadar kod noktasında aranır (tek yer; kural
 * mesajları ve ipuçları bu sabitten türer). Karar (2026-09-30): ilk satırın tamamı değil, ilk 100 kod nokta.
 */
export const DISCLOSURE_WINDOW = 100;

/**
 * Instagram'ın açıklamayı "daha fazla" ile kestiği yaklaşık karakter sayısı; yalnız ipucu metninde geçer.
 * Platform davranışı değişebilir, resmî kaynaktan doğrulanmadı [DY].
 */
export const CAPTION_TRUNCATION_APPROX = 125;

/** Açıklamanın ibare penceresi: baştaki boşluk/boş satırlar atılır, sonra ilk `window` kod noktası (ham metin). */
export function disclosureHeadOf(caption: string, window: number = DISCLOSURE_WINDOW): string {
  return Array.from(caption.trimStart()).slice(0, window).join("");
}

/** Normalize edilmiş metni kelimelere böler ("#reklam" → "reklam", "Reklam:" → "reklam"). */
export function wordsOf(folded: string): string[] {
  return folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * `needle` (fold edilmiş), `folded` içinde KELİME SINIRIYLA geçiyor mu? "ece" → "gecelik"te geçmez, "Ece'nin" ve
 * "@ece"de geçer. İki taraf da `foldTurkish` çıktısı olmalı; boş `needle` hiçbir şeyle eşleşmez.
 */
export function containsWord(folded: string, needle: string): boolean {
  if (needle === "") return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(folded);
}
