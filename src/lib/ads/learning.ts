/**
 * İki yönlü öğrenme kuralları (plan §5; düz kod, LLM yok): organik → reklam adayı · rakip hücresi → "reklamda dene" · reklamda tutan →
 * "organikte dene" · yorulan → aynı hücrede yeni açılış. Çıktı yalnız işaret listesidir (karar kartı, fikir metni başka katmanın işi).
 * Düşük güvenli işaret `weak: true`: "kural değil işaret", tek başına kart üretmez. Organik ve reklam ölçüleri BİRLEŞTİRİLMEZ: burada
 * hiçbir ortak sayı, ortalama ya da sıralama yok; iki taraf ayrı alanlardan okunur.
 */
import { betterThanBaseline } from "@/lib/ads/baseline";
import { DEFAULT_AD_RULES, type AdResult, type AdSignal, type AdVerdict } from "@/lib/domain/ads";
import { LIFT_TIER_MIN, type ContentScore } from "@/lib/domain/content";
import type { CreativeMatrixCell } from "@/lib/domain/creative-matrix";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";

/** Kendi içerik reklam adayı: son 60 gün, lift en az 2. */
export const AD_CANDIDATE_MAX_AGE_DAYS = 60;
export const AD_CANDIDATE_MIN_LIFT = LIFT_TIER_MIN[2];
/** Rakip tutanı: lift en az 3 (güçlü kademe). */
export const RIVAL_WINNER_MIN_LIFT = LIFT_TIER_MIN[3];

export const LEARNING_KINDS = ["ad_candidate", "try_in_ads", "try_organic", "refresh_opening"] as const;
export type LearningKind = (typeof LEARNING_KINDS)[number];

export interface OrganicFact {
  contentId: string;
  score: ContentScore;
  /** Yayınlanalı kaç gün. */
  ageDays: number;
  inNiche: boolean;
  /** Analizi kanıt denetiminden geçmiş. */
  analysisVerified: boolean;
  /** Bir reklam kreatifine bağlı. */
  linkedToAd: boolean;
}

/** Bir hücrenin reklam tarafı özeti (`adCellStateOf`). */
export interface AdCellState {
  signal: AdSignal;
  /** Yargılanmış (tuttu / yoruldu / tutmadı) kreatif sayısı. */
  judged: number;
  confidence: ConfidenceLevel;
}

export interface LearningInput {
  organic: readonly OrganicFact[];
  cells: readonly { cell: CreativeMatrixCell; ad: AdCellState }[];
  /** Reklam raporunun reklamları (yorulanlar için). */
  ads: readonly AdResult[];
}

export interface LearningMark {
  kind: LearningKind;
  subject: { contentId?: string; cell?: { angle: string; stage: string }; adId?: string };
  /** Düşük güvenli: kural değil işaret; tek başına kart üretmez. */
  weak: boolean;
  /** Neden (kod listesi; cümleyi düz dil sözlüğü kurar). */
  reasons: string[];
}

// ----------------------------------------------------------- Tuttu / tutmadı

export type AdOutcome = "worked" | "fatigued" | "weak";

/** Tuttu = `scale` ya da alışılmışından iyi `hold`; yoruldu = `fatigued`; tutmadı = `reduce | stop`; gerisi yargılanmamış (`undefined`). */
export function adOutcomeOf(verdict: Pick<AdVerdict, "status">, vsBaseline: AdResult["vsBaseline"]): AdOutcome | undefined {
  if (verdict.status === "scale") return "worked";
  if (verdict.status === "hold") return betterThanBaseline(vsBaseline) === true ? "worked" : undefined;
  if (verdict.status === "fatigued") return "fatigued";
  if (verdict.status === "reduce" || verdict.status === "stop") return "weak";
  return undefined;
}

/**
 * Bir hücredeki kreatiflerin reklam işareti (öncelik: worked > fatigued > weak > unmeasured > untested). `results`: hücredeki reklamlar.
 * Güven: yargılanan kreatif sayısı `cellMinJudgedForConfidence`'ın altındaysa düşük; yoksa karar güvenlerinin zayıfı.
 */
export function adCellStateOf(results: readonly AdResult[]): AdCellState {
  if (results.length === 0) return { signal: "untested", judged: 0, confidence: "low" };
  const outcomes = results.map((result) => ({ result, outcome: adOutcomeOf(result.verdict, result.vsBaseline) }));
  const judged = outcomes.filter((item) => item.outcome !== undefined);
  const has = (outcome: AdOutcome) => judged.some((item) => item.outcome === outcome);
  const signal: AdSignal = has("worked") ? "worked" : has("fatigued") ? "fatigued" : has("weak") ? "weak" : "unmeasured";
  if (judged.length === 0) return { signal, judged: 0, confidence: "low" };
  const rank: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };
  const weakest = judged.reduce<ConfidenceLevel>((min, item) => (rank[item.result.verdict.confidence] < rank[min] ? item.result.verdict.confidence : min), "high");
  return { signal, judged: judged.length, confidence: judged.length < DEFAULT_AD_RULES.cellMinJudgedForConfidence ? "low" : weakest };
}

// ------------------------------------------------------------------- Kurallar

const cellSubject = (cell: CreativeMatrixCell) => ({ cell: { angle: cell.angle, stage: cell.stage } });

/** Dört yönün işaretleri; güçlüler önce, sonra tür sırası ve kimlik (kararlı). */
export function buildLearningMarks(input: LearningInput): LearningMark[] {
  const marks: LearningMark[] = [];

  for (const fact of input.organic) {
    const { lift, lowConfidence } = fact.score;
    if (fact.linkedToAd || !fact.inNiche || !fact.analysisVerified || fact.ageDays > AD_CANDIDATE_MAX_AGE_DAYS) continue;
    if (lift === undefined || lift < AD_CANDIDATE_MIN_LIFT || lowConfidence) continue;
    marks.push({ kind: "ad_candidate", subject: { contentId: fact.contentId }, weak: false, reasons: ["organic_won_not_in_ads"] });
  }

  for (const { cell, ad } of input.cells) {
    const winner = cell.samples.some((sample) => !sample.isOwn && sample.currentLift !== undefined && sample.currentLift >= RIVAL_WINNER_MIN_LIFT);
    const provenByRivals = cell.status === "proven_opportunity" && cell.rivals.confidence !== "low";
    if (ad.signal === "untested" && (provenByRivals || winner)) {
      marks.push({ kind: "try_in_ads", subject: cellSubject(cell), weak: cell.rivals.confidence === "low", reasons: [winner ? "rival_winner_in_cell" : "rival_proven_cell"] });
    }
    if (ad.signal === "worked" && cell.own.n === 0) {
      marks.push({ kind: "try_organic", subject: cellSubject(cell), weak: ad.confidence === "low", reasons: ["ad_worked_organic_untried"] });
    }
  }

  for (const result of input.ads) {
    if (result.verdict.status !== "fatigued") continue;
    marks.push({ kind: "refresh_opening", subject: { adId: result.ad.id }, weak: result.verdict.confidence === "low", reasons: ["ad_fatigued_new_opening"] });
  }

  const subjectKey = (mark: LearningMark): string => mark.subject.contentId ?? mark.subject.adId ?? `${mark.subject.cell?.angle}:${mark.subject.cell?.stage}`;
  return marks.sort(
    (a, b) => Number(a.weak) - Number(b.weak) || LEARNING_KINDS.indexOf(a.kind) - LEARNING_KINDS.indexOf(b.kind) || subjectKey(a).localeCompare(subjectKey(b)),
  );
}
