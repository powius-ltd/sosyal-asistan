import { formatDecimal } from "@/lib/format";

/**
 * Düz dil sözlüğünün çarpan (lift) parçası: `plain-language.ts` buradan alır. Ayrı durur ki sözlüğün diğer parçaları
 * (`plain-language-ads.ts`) döngü kurmadan aynı yuvarlamayı kullansın.
 */

/** Ondalık basamak: 2,3 gibi (ekranda "2,3x" ile aynı hassasiyet). */
export const LIFT_DIGITS = 1;

/** Lift'i ekranın gösterdiği hassasiyete yuvarlar (0,96 → 1; 0,04 → 0). Sonlu olmayan ya da negatif → undefined. */
export function roundedLift(lift: number | undefined): number | undefined {
  if (lift === undefined || !Number.isFinite(lift) || lift < 0) return undefined;
  const factor = 10 ** LIFT_DIGITS;
  return Math.round(lift * factor) / factor;
}

/**
 * Çarpan ifadesi: `liftTimes(5.9)` → "5,9 katı". Yuvarlayınca 0 olan değer için undefined ("0,0 katı" diye cümle kurulmaz; bunun için
 * `liftPhrase` doğru cümleyi seçer). Ölçülemeyen → undefined.
 */
export function liftTimes(lift: number | undefined): string | undefined {
  const rounded = roundedLift(lift);
  if (rounded === undefined || rounded === 0) return undefined;
  const text = formatDecimal(rounded, LIFT_DIGITS);
  return text === undefined ? undefined : `${text} katı`;
}
