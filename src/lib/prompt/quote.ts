/**
 * Güvenilmeyen metnin (rakip transcript'i, hook, alt yazı, fikir alanları) prompta tırnaklı girişi. Metnin içindeki
 * tırnak karakterleri (“ ” „ ‟ ") düz tek tırnağa çevrilir: aksi hâlde metin kendi tırnağını erken kapatıp
 * tırnak dışına talimat yazabilirdi. Uzunluk değişmez (bire bir çeviri), bu yüzden kısaltmadan önce ya da sonra çağrılabilir.
 */
const QUOTE_CHARS = /[“”„‟"]/g;

/** Metni “…” içine alır; içindeki tırnak karakterleri etkisizleştirilir. */
export function quoteUntrusted(text: string): string {
  return `“${text.replace(QUOTE_CHARS, "'")}”`;
}
