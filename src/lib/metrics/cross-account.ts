/**
 * Hesaplar arası karşılaştırma: farklı boydaki hesapların içeriklerini aynı ölçeğe koyar.
 */

/**
 * crossScore = ln(views / takipçi) × ln(takipçi).
 * Takipçi < 2 (ln(1) = 0, skor anlamsız), views ≤ 0 ya da herhangi biri bilinmiyorsa → undefined.
 */
export function crossScore(views?: number, followers?: number): number | undefined {
  if (views === undefined || followers === undefined) return undefined;
  if (!(followers >= 2) || !(views > 0)) return undefined;
  const r = Math.log(views / followers) * Math.log(followers);
  return Number.isFinite(r) ? r : undefined;
}

/**
 * Benzer boy: takipçi sayıları birbirinin en fazla `ratio` katı (varsayılan ±3x, sınır dahil).
 * Takipçi bilinmiyor / pozitif değil ya da ratio < 1 → undefined (karar verilemez).
 */
export function similarSize(own?: number, other?: number, ratio = 3): boolean | undefined {
  if (own === undefined || other === undefined) return undefined;
  if (!(own > 0) || !(other > 0) || !(ratio >= 1)) return undefined;
  return Math.max(own, other) / Math.min(own, other) <= ratio;
}
