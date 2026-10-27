/**
 * Video analizi seçimi (saf; DB/ağ yok) — docs/FAZ2-PLAN.md §3 sırası:
 *   0) kendi videoların · 1) rakip ≥ 3x · 2) rakip kademe 2 · 3) kontrast (en düşük lift'li en çok 3 rakip) · 4) kalan rakipler.
 * Kurallar:
 *  - Analizi `ok` ya da `insufficient_data` olan atlanır (tekrar para/kota harcanmaz); `failed` yeniden denenir.
 *  - Konu eleğinin niş dışı bulduğu RAKİP çıkar (`inNiche === false`). Elenmemiş (`undefined`) niş dışı sayılmaz: çağıran eleği çalıştırıp
 *    tekrar seçer. Kendi videolar eleğe bakılmadan girer (ses kaynağı).
 *  - Lift ölçülemeyen (`undefined`) rakip tutan/düşük sayılmaz: yalnız "kalan" grubunda, sonda yer alır (undefined ≠ 0).
 *  - `pilot`: 1 kendi + 2 rakip (biri tutan, biri tutmayan). Yoksa `limit`'e kadar sıralı.
 */
import { OUTLIER_MIN_TIER, type LiftTier } from "@/lib/domain/content";
import type { AnalysisStatus } from "@/lib/domain/intel";

export const DEFAULT_ANALYZE_LIMIT = 19;
/** Kendi videolardan öncelikli analiz edilecek toplam sayı (§3 "0) Ornek'in 10 videosu"); fazlası rakiplerden sonra gelir. */
export const OWN_PRIORITY_TARGET = 10;
/** Kontrast grubundaki en çok rakip sayısı (neyin TUTMADIĞINI görmek için; seçim yanlılığını azaltır). */
export const CONTRAST_LIMIT = 3;
export const PILOT_OWN = 1;
export const PILOT_RIVALS = 2;

export interface AnalysisCandidate {
  id: string;
  isOwn: boolean;
  handle: string;
  /** Ölçülemediyse undefined. */
  lift?: number;
  liftTier?: LiftTier;
  publishedAt?: string;
  /** Konu eleği: true niş içi · false niş dışı · undefined elenmedi. */
  inNiche?: boolean;
  /** Mevcut analizin durumu; hiç analiz yoksa undefined. */
  analysisStatus?: AnalysisStatus;
}

export interface SelectOptions {
  limit: number;
  pilot?: boolean;
}

const DONE: readonly AnalysisStatus[] = ["ok", "insufficient_data"];

/** Lift azalan; ölçülemeyen sonda; eşitlikte yayın tarihi yeni önce, sonra id (deterministik). */
function byLiftDesc(a: AnalysisCandidate, b: AnalysisCandidate): number {
  if (a.lift !== b.lift) {
    if (a.lift === undefined) return 1;
    if (b.lift === undefined) return -1;
    return b.lift - a.lift;
  }
  return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.id.localeCompare(b.id);
}

const isOutlier = (c: AnalysisCandidate) => c.liftTier !== undefined && c.liftTier >= OUTLIER_MIN_TIER;

/** Analiz edilebilir aday mı (yapılmamış ve — rakipse — niş dışı değil). */
export function isSelectable(candidate: AnalysisCandidate): boolean {
  if (candidate.analysisStatus !== undefined && DONE.includes(candidate.analysisStatus)) return false;
  return candidate.isOwn || candidate.inNiche !== false;
}

/** Analiz edilecek aday sayısı (limit ÖNCESİ): `analyze` işi ve halka sayacı AYNI kuralı kullanır. */
export function countSelectable(candidates: readonly AnalysisCandidate[]): number {
  return candidates.filter(isSelectable).length;
}

/** Rakipleri §3 sırasına dizer: tutanlar · kademe 2 · kontrast · kalanlar. */
function orderRivals(rivals: readonly AnalysisCandidate[]): AnalysisCandidate[] {
  const outliers = rivals.filter(isOutlier).sort(byLiftDesc);
  const tier2 = rivals.filter((c) => c.liftTier === 2).sort(byLiftDesc);
  const contrast = rivals
    .filter((c) => c.liftTier === 0 && c.lift !== undefined)
    .sort((a, b) => (a.lift as number) - (b.lift as number) || a.id.localeCompare(b.id))
    .slice(0, CONTRAST_LIMIT);
  const taken = new Set([...outliers, ...tier2, ...contrast].map((c) => c.id));
  const rest = rivals.filter((c) => !taken.has(c.id)).sort(byLiftDesc);
  return [...outliers, ...tier2, ...contrast, ...rest];
}

function pilotPick(own: readonly AnalysisCandidate[], rivals: readonly AnalysisCandidate[]): AnalysisCandidate[] {
  const ordered = orderRivals(rivals);
  const outlier = ordered.find(isOutlier) ?? ordered[0];
  const contrast = ordered.find((c) => c !== outlier && !isOutlier(c)) ?? ordered.find((c) => c !== outlier);
  return [...own.slice(0, PILOT_OWN), ...[outlier, contrast].filter((c): c is AnalysisCandidate => c !== undefined).slice(0, PILOT_RIVALS)];
}

/**
 * Bir sonraki konu eleği partisi (saf). Seçimde elenebilir (elenmemiş + metinli + denenmemiş) rakip yoksa boş döner (eleme biter).
 * Varsa rakip SIRASINDAKİ ilk `window` (en az seçimdeki elenebilir sayısı kadar) elenebilir rakip: pahalı eleme birkaç turda yakınsasın
 * diye tek tek değil pencereyle yapılır; niş dışı çıkanların yerine gelecek adaylar da aynı turda elenmiş olur.
 */
export function pickScreeningBatch(
  candidates: readonly AnalysisCandidate[],
  selection: readonly AnalysisCandidate[],
  screenable: (candidate: AnalysisCandidate) => boolean,
  window: number,
): AnalysisCandidate[] {
  const needed = selection.filter(screenable).length;
  if (needed === 0) return [];
  const everyOne = selectForAnalysis(candidates, { limit: Number.MAX_SAFE_INTEGER });
  return everyOne.filter(screenable).slice(0, Math.max(window, needed));
}

/** Sıralı analiz listesi (en çok `limit`). Girdi dizisini değiştirmez. */
export function selectForAnalysis(candidates: readonly AnalysisCandidate[], options: SelectOptions): AnalysisCandidate[] {
  const pool = candidates.filter(isSelectable);
  const own = pool.filter((c) => c.isOwn).sort(byLiftDesc);
  const rivals = pool.filter((c) => !c.isOwn);
  if (options.pilot) return pilotPick(own, rivals);
  // Kendi videolar toplamda (önceden analiz edilenler dahil) en çok OWN_PRIORITY_TARGET kadar öne alınır; kalanı rakiplerden sonra.
  const ownDone = candidates.filter((c) => c.isOwn && c.analysisStatus !== undefined && DONE.includes(c.analysisStatus)).length;
  const ownQuota = Math.max(0, OWN_PRIORITY_TARGET - ownDone);
  return [...own.slice(0, ownQuota), ...orderRivals(rivals), ...own.slice(ownQuota)].slice(0, Math.max(0, options.limit));
}
