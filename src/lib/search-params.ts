/**
 * URL `searchParams` yardımcıları — tek yer. Next 16'da `searchParams` bir Promise'tir ve aynı anahtar
 * birden çok kez gelirse değer dizidir (`?a=1&a=2`); ayrıştırıcılar ilk değeri okur, dizi taşımaz.
 * URL'ye güvenilmez: doğrulama (whitelist) ayrıştırıcıdadır.
 */

/** Sayfaya gelen ham `searchParams` (Next: `PageProps["searchParams"]` çözülmüş hali). */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Tek değerli parametre: dizi gelirse ilk eleman, yoksa undefined. */
export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
