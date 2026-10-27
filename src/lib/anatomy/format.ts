/**
 * Reçete değerlerinin yazımı (tek yer: fark cümlesi `recipe.ts` ve reçete tablosu aynı biçimi kullanır). Saf; tr-TR (`lib/format`).
 * Ölçülemeyen değer buraya gelmez (çağıran `undefined`'ı tire + sebep olarak gösterir).
 */
import { formatDecimal, formatPercent } from "@/lib/format";
import type { RecipeMetric } from "@/lib/domain/anatomy";

const count = (value: number, unit: string) => `${formatDecimal(value, Number.isInteger(value) ? 0 : 1)} ${unit}`;

const FORMATTERS: Record<RecipeMetric, (value: number) => string> = {
  hookWords: (v) => count(v, "kelime"),
  firstSectionSec: (v) => count(v, "sn"),
  durationSec: (v) => count(v, "sn"),
  sectionCount: (v) => count(v, "bölüm"),
  cutsPerMinute: (v) => `${formatDecimal(v, 1)} kesme/dk`,
  screenTextCount: (v) => count(v, "adet"),
  onCameraShare: (v) => formatPercent(v, 0) ?? "",
  ctaShare: (v) => formatPercent(v, 0) ?? "",
};

/** "14 sn", "6,5 kesme/dk", "%67". */
export function formatRecipeValue(metric: RecipeMetric, value: number): string {
  return FORMATTERS[metric](value);
}

/** Gövde tipi payı (0..1): "%67". */
export function formatShare(share: number): string {
  return formatPercent(share, 0) ?? "";
}
