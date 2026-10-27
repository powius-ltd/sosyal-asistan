/**
 * Rakip adayı sıralaması — SAF kural (DB / ağ / LLM yok). Puan = niş uyumu × boyut uygunluğu × tutan oranı.
 * LLM yalnız niş etiketini verir (`competitor_screens`); sayılabilen her şey burada düz kodla hesaplanır.
 *
 * Sıra (tek yerde): önce normal adaylar, sonra BOYUT DIŞI olanlar (elenmez, sona düşer), en sonda NİŞ DIŞI (`off`) olanlar; her grupta puan
 * azalan, eşit puanda girdi (kaynak) sırası. Bilinmeyen değer (`undefined`) nötr çarpan alır; 0 sayılmaz.
 * `reasons`: müşteriye okunabilir düz cümleler (panel jargonu yok: lift, baz çizgisi, kademe yazılmaz).
 */
import { formatNumber, formatPercent } from "@/lib/format";

/** Takipçi, kendi hesabın bu aralığındaysa boyut uygun sayılır. */
export const SIZE_RANGE = { min: 0.3, max: 10 } as const;
/** Bir videonun "tuttu" sayılması için normalinin en az kaç katı izlenmesi (kademe 3 eşiği, `domain/content.ts`). */
export const HIT_LIFT_MIN = 3;
/** Çarpanlar: bilinmeyen değer nötr, niş uyumu `unsure` yarım. */
export const FACTORS = { fit: 1, unsure: 0.5, off: 0.1, sizeIn: 1, sizeUnknown: 0.8, hitFloor: 0.25, hitNeutral: 0.6 } as const;
/** Önerilen aday sayısı (başlangıç akışında ilk `ONBOARDING_RIVALS_PRESELECT` ön seçili kalır). */
export const RECOMMEND_COUNT = 5;

export interface RankableCandidate {
  id: string;
  handle: string;
  /** Bilinmiyorsa yok (0 değil). */
  followers?: number;
}

export interface CandidateScreenInfo {
  fit: "fit" | "off" | "unsure";
  reason?: string;
}

/** Adayın toplanmış videolarında tutan payı için sayılar; `videos` lifti ölçülmüş video sayısıdır. */
export interface CandidateLiftStats {
  videos: number;
  hits: number;
}

export interface RankContext {
  /** Kendi hesabın takipçisi; bilinmiyorsa boyut herkes için nötr. */
  ownFollowers?: number;
  screens: ReadonlyMap<string, CandidateScreenInfo>;
  liftStats: ReadonlyMap<string, CandidateLiftStats>;
}

export interface RankedCandidate<T extends RankableCandidate> {
  candidate: T;
  /** 1'den başlar. */
  rank: number;
  score: number;
  fit: "fit" | "off" | "unsure" | "unscreened";
  size: "in_range" | "out_of_range" | "unknown";
  /** Tutan oranı (0–1); video yoksa yok. */
  hitRate?: number;
  /** İlk `RECOMMEND_COUNT` içinde, boyut dışı ve niş dışı olmayan aday. */
  recommended: boolean;
  /** Neden bu sırada: düz Türkçe cümleler. */
  reasons: string[];
}

export function sizeVerdict(ownFollowers: number | undefined, followers: number | undefined): RankedCandidate<RankableCandidate>["size"] {
  if (ownFollowers === undefined || followers === undefined || !(ownFollowers > 0)) return "unknown";
  const ratio = followers / ownFollowers;
  return ratio >= SIZE_RANGE.min && ratio <= SIZE_RANGE.max ? "in_range" : "out_of_range";
}

const fitFactor = (fit: RankedCandidate<RankableCandidate>["fit"]): number => (fit === "fit" ? FACTORS.fit : fit === "off" ? FACTORS.off : FACTORS.unsure);
const sizeFactor = (size: RankedCandidate<RankableCandidate>["size"]): number => (size === "unknown" ? FACTORS.sizeUnknown : FACTORS.sizeIn);

function reasonsOf(fit: RankedCandidate<RankableCandidate>["fit"], screen: CandidateScreenInfo | undefined, size: RankedCandidate<RankableCandidate>["size"], followers: number | undefined, hitRate: number | undefined): string[] {
  const out: string[] = [];
  if (fit === "fit") out.push(screen?.reason ? `Aynı konuda paylaşıyor: ${screen.reason}` : "Aynı konuda paylaşıyor.");
  else if (fit === "off") out.push(screen?.reason ? `Başka bir konuda paylaşıyor: ${screen.reason}` : "Başka bir konuda paylaşıyor.");
  else out.push("Konusu henüz net değil.");
  if (size === "in_range") out.push(`Benzer boyutta (${formatNumber(followers)} takipçi).`);
  else if (size === "out_of_range") out.push(`Boyutu seninkinden çok farklı (${formatNumber(followers)} takipçi), bu yüzden daha altta.`);
  else out.push(followers === undefined ? "Takipçi sayısı bilinmiyor." : "Boyut karşılaştırılamadı (kendi takipçi sayın bilinmiyor).");
  if (hitRate !== undefined) out.push(`Videolarının ${formatPercent(hitRate, 0)}'i normalinin en az ${HIT_LIFT_MIN} katı izlenmiş.`);
  else out.push("Henüz toplanmış videosu yok.");
  return out;
}

/** Girdi sırası kaynak sırasıdır (eşit puanda korunur). */
export function rankCandidates<T extends RankableCandidate>(candidates: readonly T[], context: RankContext): RankedCandidate<T>[] {
  const scored = candidates.map((candidate, order) => {
    const screen = context.screens.get(candidate.id);
    const fit: RankedCandidate<RankableCandidate>["fit"] = screen?.fit ?? "unscreened";
    const size = sizeVerdict(context.ownFollowers, candidate.followers);
    const stats = context.liftStats.get(candidate.id);
    const hitRate = stats !== undefined && stats.videos > 0 ? Math.min(1, stats.hits / stats.videos) : undefined;
    const hitFactor = hitRate === undefined ? FACTORS.hitNeutral : FACTORS.hitFloor + (1 - FACTORS.hitFloor) * hitRate;
    const score = fitFactor(fit) * sizeFactor(size) * hitFactor;
    const group = fit === "off" ? 2 : size === "out_of_range" ? 1 : 0;
    return { candidate, order, fit, size, hitRate, score, group, reasons: reasonsOf(fit, screen, size, candidate.followers, hitRate) };
  });
  scored.sort((a, b) => a.group - b.group || b.score - a.score || a.order - b.order);
  return scored.map((entry, index) => ({
    candidate: entry.candidate,
    rank: index + 1,
    score: entry.score,
    fit: entry.fit,
    size: entry.size,
    ...(entry.hitRate === undefined ? {} : { hitRate: entry.hitRate }),
    recommended: index < RECOMMEND_COUNT && entry.group === 0,
    reasons: entry.reasons,
  }));
}
