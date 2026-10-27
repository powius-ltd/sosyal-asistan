/**
 * Hücrenin reklam işareti (`AdCellSignalRule`, `domain/ads.ts`): saf, hesap türüne ve platforma bakmaz. Öncelik sırası `AD_SIGNALS`:
 * `worked > 0` → worked · `fatigued > 0` → fatigued · `weak > 0` → weak · `creatives > 0` → unmeasured · aksi → untested.
 * Sayılar `undefined` ise 0 gibi okunmaz: hiç sayı yoksa kreatif varsa `unmeasured`, yoksa `untested` döner (kural yalnız pozitif sayıya bakar).
 */
import type { AdCellSignalRule } from "@/lib/domain/ads";

const positive = (n: number | undefined): boolean => n !== undefined && n > 0;

export const adCellSignalOf: AdCellSignalRule = (ads) => {
  if (positive(ads.worked)) return "worked";
  if (positive(ads.fatigued)) return "fatigued";
  if (positive(ads.weak)) return "weak";
  if (positive(ads.creatives)) return "unmeasured";
  return "untested";
};
