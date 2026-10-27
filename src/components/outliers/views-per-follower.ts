/**
 * "İzlenme / takipçi": videonun izlenmesinin hesabın takipçi sayısına oranı. Çapraz skorun (`crossScore`, ln(izlenme ÷
 * takipçi) × ln(takipçi)) yerine ekranda bu gösterilir: çapraz skor izlenme < takipçi iken negatif çıkar ve anlamsız
 * görünür. Ölçülemeyen değer `undefined`'dır, 0 değil: takipçi/izlenme yoksa sebebiyle `unmeasured` döner.
 */
import { measured, unmeasured, type Measured } from "@/lib/domain/measured";
import { formatPercent } from "@/lib/format";

export const VIEWS_UNMEASURED_REASON = "Bu içerik türünde izlenme sayısı platformdan alınamadı.";
export const FOLLOWERS_UNMEASURED_REASON = "Hesabın takipçi sayısı ölçülemedi.";
export const FOLLOWERS_ZERO_REASON = "Takipçi sayısı 0 görünüyor; oran hesaplanamaz.";

function isCount(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** izlenme ÷ takipçi (1 = %100). İzlenme 0 gerçek ölçümdür (oran 0); takipçi yok/0 ya da izlenme yok → ölçülemedi + sebep. */
export function viewsPerFollower(views: number | undefined, followers: number | undefined): Measured<number> {
  if (!isCount(followers)) return unmeasured(FOLLOWERS_UNMEASURED_REASON);
  if (followers <= 0) return unmeasured(FOLLOWERS_ZERO_REASON);
  if (!isCount(views)) return unmeasured(VIEWS_UNMEASURED_REASON);
  return measured(views / followers);
}

/** 0,069 → "%6,9"; 12,3 → "%1.230" (oran 10 ve üstündeyse ondalık basamak gereksiz). */
export function formatViewsPerFollower(ratio: number): string | undefined {
  return formatPercent(ratio, ratio >= 10 ? 0 : 1);
}
