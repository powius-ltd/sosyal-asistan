/**
 * Özet'in "Neredeyiz" ve "Bu hafta ne yaptık" satırları (tasarım §3): şablon + sayı, LLM yok. Ölçülemeyen değer cümleye girmez
 * (sıfır yazılmaz): cümle düşer ya da "henüz veri yok" der. Düz dil sözlüğü `lib/plain-language.ts`.
 */
import { LIFT_TIER_MIN, OUTLIER_MIN_TIER } from "@/lib/domain/content";
import { weekDayKeys } from "@/lib/domain/weekly-plan";
import { formatDayMonth, formatNumber, formatPercent } from "@/lib/format";
import { kpiOf, viewsChange } from "@/lib/overview/period-change";
import type { OverviewSummaryInput, SummaryLine } from "@/lib/overview/types";
import { liftTimes } from "@/lib/plain-language";
import { ROUTES, thisWeekFor } from "@/lib/routes";

/** "Neredeyiz" için hiçbir sayı okunamadığında. */
export const NO_NUMBERS_TEXT = "Videolarının sayıları için henüz yeterli veri yok.";
/** Hiç bakış yapılmamış çalışma alanı (hesap yok ya da hiç veri yok). */
export const EMPTY_WHERE_TEXT = "Henüz hesabına bakmadım; ilk bakıştan sonra nerede olduğunu burada yazacağım.";
/** Veri var, plan yok. */
export const NO_PLAN_YET_TEXT = "plan hazır olunca burada göreceksin";

const OUTLIER_FACTOR = formatNumber(LIFT_TIER_MIN[OUTLIER_MIN_TIER]) ?? String(LIFT_TIER_MIN[OUTLIER_MIN_TIER]);
/** "normalinin en az 3 katı" (tutan video eşiği; `OUTLIER_PLAIN.definition` ile aynı eşikten). */
const OUTLIER_THRESHOLD_PHRASE = `normalinin en az ${OUTLIER_FACTOR} katı`;

/** "%47,9 arttı" / "%12 azaldı" / "aynı kaldı" (yuvarlayınca %0 ise). */
function changePhrase(ratio: number): string {
  const percent = formatPercent(Math.abs(ratio));
  if (percent === undefined || percent === "%0") return "aynı kaldı";
  return `${percent} ${ratio > 0 ? "arttı" : "azaldı"}`;
}

function periodSentence(input: OverviewSummaryInput): string | undefined {
  const { overview } = input;
  const posts = kpiOf(overview, "posts")?.value;
  const views = kpiOf(overview, "views")?.value;
  const parts: string[] = [];
  if (posts !== undefined) parts.push(posts === 0 ? "video paylaşmadın" : `${formatNumber(posts)} video paylaştın`);
  if (views !== undefined) parts.push(`${formatNumber(views)} izlenme aldın`);
  if (parts.length === 0 || overview === undefined) return undefined;
  const change = viewsChange(overview);
  const compare = change === undefined ? "" : `; önceki ${overview.days} güne göre ${changePhrase(change)}`;
  return `Son ${overview.days} günde ${parts.join(", ")}${compare}.`;
}

function outlierSentence(input: OverviewSummaryInput): string | undefined {
  const stat = input.ownOutliers;
  if (stat === undefined) return undefined;
  if (stat.count > 0) {
    const best = liftTimes(stat.bestLift);
    return `${formatNumber(stat.count)} videon ${OUTLIER_THRESHOLD_PHRASE} izlendi${best === undefined ? "" : `; en iyisi ${best}`}.`;
  }
  // Sıfır tutan, yalnız videoların izlenmesi ölçülmüşse "yok" demektir; ölçülmediyse bilinmiyor.
  return kpiOf(input.overview, "views")?.value === undefined ? undefined : `Henüz ${OUTLIER_THRESHOLD_PHRASE} izlenen bir videon yok.`;
}

/** "Neredeyiz": dönem cümlesi + tutan cümlesi; "Hangileri?" yalnız tutan video varsa. */
export function buildWhereLine(input: OverviewSummaryInput): SummaryLine | undefined {
  if (input.overview === undefined && input.ownOutliers === undefined) return undefined;
  const sentences = [periodSentence(input), outlierSentence(input)].filter((sentence): sentence is string => sentence !== undefined);
  if (sentences.length === 0) return { text: NO_NUMBERS_TEXT };
  const hasOutliers = (input.ownOutliers?.count ?? 0) > 0;
  return { text: sentences.join(" "), link: hasOutliers ? { label: "Hangileri?", href: ROUTES.outliers } : undefined };
}

/** "5 Eki – 11 Eki": haftanın Pazartesi'sinden Pazar'ına. */
export function weekShortRange(weekStart: string): string | undefined {
  const days = weekDayKeys(weekStart);
  if (days.length !== 7) return undefined;
  const from = formatDayMonth(days[0], "UTC");
  const to = formatDayMonth(days[6], "UTC");
  return from === undefined || to === undefined ? undefined : `${from} – ${to}`;
}

const capitalize = (text: string) => (text === "" ? text : text[0].toLocaleUpperCase("tr-TR") + text.slice(1));

/** Plan parçası ve bağlantısı: güncel hafta planı hazır · bu hafta için plan yok (eski plan) · hiç plan yok. */
function planPart(input: OverviewSummaryInput): { text?: string; noPlanYet: boolean; weekStart?: string } {
  const { plan, currentWeekStart } = input;
  if (plan === undefined) return { noPlanYet: false };
  if (plan === null) return { noPlanYet: true };
  if (plan.status === "archived") return { noPlanYet: false };
  if (currentWeekStart !== undefined && plan.weekStart < currentWeekStart) {
    return { text: "bu hafta için henüz plan çıkarmadım", noPlanYet: false };
  }
  const range = weekShortRange(plan.weekStart);
  const prefix = range === undefined ? "" : `${range} `;
  const text = plan.status === "draft" ? `${prefix}planının taslağı hazır` : `${prefix}planın hazır`;
  return { text, noPlanYet: false, weekStart: plan.weekStart };
}

/** "Bu hafta ne yaptık": incelenen video + çıkan fikir + plan. Parça yoksa düşer; hiçbiri okunamadıysa satır yok. */
export function buildDoneLine(input: OverviewSummaryInput): SummaryLine | undefined {
  const done: string[] = [];
  if (input.activity !== undefined && input.activity.analyzedVideos > 0) {
    done.push(`${input.activity.truncated ? "en az " : ""}${formatNumber(input.activity.analyzedVideos)} video inceledim`);
  }
  if (input.newIdeas !== undefined && input.newIdeas > 0) done.push(`${formatNumber(input.newIdeas)} fikir çıkardım`);
  const plan = planPart(input);
  const link = plan.weekStart === undefined ? undefined : { label: "Planı aç", href: thisWeekFor(plan.weekStart) };

  const lead = done.length > 0 ? `Bu hafta ${done.join(", ")}` : undefined;
  if (plan.text !== undefined) {
    return { text: lead === undefined ? `${capitalize(plan.text)}.` : `${lead}; ${plan.text}.`, link };
  }
  if (plan.noPlanYet) {
    return { text: lead === undefined ? `Videolarını inceliyorum; ${NO_PLAN_YET_TEXT}.` : `${lead}; ${NO_PLAN_YET_TEXT}.` };
  }
  return lead === undefined ? undefined : { text: `${lead}.` };
}
