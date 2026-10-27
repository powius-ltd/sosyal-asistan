/**
 * Lift = views / baz çizgisi medyanı; kademe eşikleri `LIFT_TIER_MIN` (domain'de tek yer).
 * Hesaplanamayan lift/kademe undefined'dır (ölçülemedi ≠ kademe 0).
 */
import { LIFT_TIER_MIN, liftTierFor, type LiftTier } from "@/lib/domain/content";
import type { BaselineResult } from "@/lib/metrics/types";

export { LIFT_TIER_MIN };
export type { LiftTier };

/** views ya da medyan yok, medyan pozitif değil (0/negatif/NaN) ya da sonuç sonlu değil → undefined. views 0 → lift 0 (ölçüldü). */
export function lift(
  views: number | undefined,
  baseline: Pick<BaselineResult, "median"> | undefined,
): number | undefined {
  const m = baseline?.median;
  if (views === undefined || m === undefined || !(m > 0)) return undefined;
  if (!(views >= 0)) return undefined;
  const r = views / m;
  return Number.isFinite(r) ? r : undefined;
}

/** 0: <1.5x · 1: ≥1.5x · 2: ≥2x · 3: ≥3x · 4: ≥5x. undefined lift → undefined kademe. */
export function liftTier(value: number | undefined): LiftTier | undefined {
  return liftTierFor(value);
}
