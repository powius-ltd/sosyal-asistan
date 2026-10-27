/**
 * Olgu paketinin tek tek olguları (içerik, matris hücresi, plan, ölçüm zamanı, fikir önerisi): domain nesnesinden JSON gövdesi + güven +
 * eylem + belirteç kaydı. Saf (veri okumaz). Kurallar: ölçülemeyen alan gövdeye GİRMEZ, belirteci `unmeasured` olarak kaydedilir
 * (0 yazılmaz); modele giden metin rakam içermez (süre kovası/ölçüm günü gibi etiketler sözcükle yazılır: model rakamı kopyalamasın);
 * rakip/kullanıcı metni (alt yazı, fikir başlığı) kısaltılır.
 */
import type { ActionOption, FactEntry } from "@/lib/agents/analyst/facts-types";
import { TokenTable } from "@/lib/agents/analyst/tokens";
import { BRIEFING_COMMANDS, type BriefingAction, type BriefingCommandId, type BriefingEvidenceRef } from "@/lib/domain/briefing";
import { cellRef, contentRef, dueRef, ideaRef, planRef } from "@/lib/domain/briefing-refs";
import type { ContentItem } from "@/lib/domain/content";
import type { ContentSummary } from "@/lib/domain/content-summary";
import { type CreativeMatrixCell } from "@/lib/domain/creative-matrix";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import type { IdeaLink, MeasurementDue, WeekReview } from "@/lib/domain/outcomes";
import type { DurationBucket } from "@/lib/domain/taxonomy";
import { confidenceForSample, type ConfidenceLevel, type FocusDirection, type WeeklyPlan } from "@/lib/domain/weekly-plan";
import { clipForPrompt } from "@/lib/llm/prompt-blocks";
import { ANGLE_COLUMN_PLAIN, CELL_STATUS_LONG, PRIOR_LEVEL_PLAIN, STAGE_ROW_PLAIN } from "@/lib/matrix/plain";
import { FOCUS_GROUP_PLAIN } from "@/lib/plain-language-plan";
import { weekdayName } from "@/lib/time";

const CAPTION_CHARS = 110;
const SUMMARY_CHARS = 200;
const TITLE_CHARS = 80;

/** Pakete giden ondalıklı sayı (bayt tasarrufu): oran < 1 için 4, diğerleri için 2 basamak. Belirteç değeri YUVARLANMAZ (tam değer). */
export const roundForPack = (value: number): number => (Math.abs(value) < 1 ? Math.round(value * 10_000) / 10_000 : Math.round(value * 100) / 100);

const CONFIDENCE_ORDER: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

/** Güvenlerin en zayıfı (boş liste → low: kanıtsız güven yok). */
export function weakestConfidence(levels: readonly ConfidenceLevel[]): ConfidenceLevel {
  return levels.reduce<ConfidenceLevel>((weakest, level) => (CONFIDENCE_ORDER[level] < CONFIDENCE_ORDER[weakest] ? level : weakest), levels[0] ?? "low");
}

// ------------------------------------------------------------------- Eylem

/** Hedefli eylemlerin düğme metni (kod üretir; ajan yazmaz). */
const ACTION_LABELS: Record<Exclude<BriefingAction["type"], "run_cmd">, string> = {
  open_video: "Videoyu aç",
  open_plan: "Planı aç",
  open_matrix: "Yaklaşımı aç",
  approve_link: "Eşleşmeyi gözden geçir",
};

export function targetedAction(type: Exclude<BriefingAction["type"], "run_cmd">, target: BriefingEvidenceRef): ActionOption {
  return { id: `${type}:${target}`, ref: target, action: { type, label: ACTION_LABELS[type], target, spendsMoney: false } };
}

export function commandAction(commandId: BriefingCommandId): ActionOption {
  const command = BRIEFING_COMMANDS[commandId];
  return { id: `run_cmd:${commandId}`, action: { type: "run_cmd", label: command.label, commandId, spendsMoney: command.spendsMoney } };
}

// ----------------------------------------------------------------- İçerik

/** Sayı içermeyen etiket: rakamlı etiket (ör. süre kovası "15–30 sn") modele rakam taşımasın diye atılır. */
const hasDigit = (text: string) => /\d/.test(text);

export interface ContentFactInput {
  id: string;
  handle: string;
  isOwn: boolean;
  caption?: string;
  lift?: number;
  views?: number;
  hookType?: string;
  /** Baz çizgisine giren içerik sayısı (güven kaynağı); bilinmiyorsa undefined → düşük. */
  baselineN?: number;
  immature?: boolean;
  /** Bu dönemde yeni (tutan rakip videosu). */
  isNew?: boolean;
  /** Kendi hesabın son dönemdeki EN GÜÇLÜ videolarından biri (`facts-own-best`): ajan "en iyi video" demeyi yalnız bunlar için yapabilir. */
  ownBest?: boolean;
  /** Yayından beri geçen gün (`facts-own-latest` `ageInDays`); tarih yoksa undefined. */
  ageDays?: number;
  /** Kendi hesabın EN SON yayımlanan videosu ("son videom" sorusu yalnız buna dayanır). */
  latest?: boolean;
}

export function contentInputFromItem(item: ContentItem, extra: { hookType?: string; isNew?: boolean; ownBest?: boolean; ageDays?: number; latest?: boolean } = {}): ContentFactInput {
  return {
    id: item.id,
    handle: item.owner.handle,
    isOwn: item.owner.kind === "own",
    caption: item.caption,
    lift: item.score.lift,
    views: item.metrics.views,
    baselineN: item.score.baselineN,
    immature: item.score.immature,
    ...extra,
  };
}

export function contentInputFromSummary(summary: ContentSummary, isOwn: boolean, views?: number): ContentFactInput {
  return { id: summary.contentItemId, handle: summary.ownerHandle, isOwn, caption: summary.caption, lift: summary.currentLift, views, hookType: summary.hookType };
}

export function contentEntry(input: ContentFactInput, tokens: TokenTable, rank: number): FactEntry {
  const ref = contentRef(input.id);
  tokens.addRef("lift", ref, "lift", input.lift, "lift hesaplanamadı (baz çizgisi yok ya da video çok yeni)");
  tokens.addRef("views", ref, "int", input.views, "izlenme ölçülemedi");
  tokens.addRef("ago", ref, "days_ago", input.ageDays, "yayın tarihi yok");
  const caption = clipForPrompt(input.caption, CAPTION_CHARS);
  // Tek video bir örüntüyü kanıtlamaz: baz çizgisi sağlam olsa da güven en çok orta (yüksek güven ≥ 10 örnek ister).
  const confidence: ConfidenceLevel = input.lift === undefined || input.immature === true ? "low" : weakestConfidence([confidenceForSample(input.baselineN), "medium"]);
  return {
    section: "contents",
    rank,
    ref,
    confidence,
    json: {
      ref,
      who: `@${input.handle}`,
      side: input.isOwn ? "own" : "rival",
      ...(input.hookType === undefined ? {} : { hook: hookTypeLabel(input.hookType) }),
      ...(input.isNew === true ? { new: true } : {}),
      ...(input.ownBest === true ? { best: true } : {}),
      ...(input.latest === true ? { latest: true } : {}),
      ...(input.ageDays === undefined ? {} : { ago: input.ageDays }),
      ...(input.lift === undefined ? {} : { lift: roundForPack(input.lift) }),
      ...(input.views === undefined ? {} : { views: input.views }),
      ...(caption === undefined ? {} : { caption }),
    },
    actions: [targetedAction("open_video", ref)],
  };
}

// ------------------------------------------------------------------- Hücre

/** `exampleIds`: hücrenin gösterilecek örnek videoları (içerik olgusu olarak ayrıca eklenir). */
export function cellEntry(cell: CreativeMatrixCell, tokens: TokenTable, rank: number, exampleIds: readonly string[]): FactEntry {
  const ref = cellRef(cell.stage, cell.angle);
  tokens.addRef("rn", ref, "int", cell.rivals.n);
  tokens.addRef("on", ref, "int", cell.own.n);
  tokens.addRef("rlift", ref, "lift", cell.rivals.medianLift, cell.rivals.n === 0 ? "bu hücrede rakip videosu yok" : "rakip videolarının hiçbirinin lift'i ölçülemedi");
  tokens.addRef("olift", ref, "lift", cell.own.medianLift, cell.own.n === 0 ? "bu hücrede kendi videosu yok" : "kendi videolarının hiçbirinin lift'i ölçülemedi");
  const sides = [cell.rivals, cell.own].filter((side) => side.n > 0);
  const hooks = cell.topHookTypes.map((hook) => hookTypeLabel(hook.hookType));
  return {
    section: "cells",
    rank,
    ref,
    confidence: weakestConfidence(sides.map((side) => side.confidence)),
    json: {
      ref,
      stage: STAGE_ROW_PLAIN[cell.stage],
      angle: ANGLE_COLUMN_PLAIN[cell.angle],
      prior: PRIOR_LEVEL_PLAIN[cell.prior],
      status: CELL_STATUS_LONG[cell.status],
      rn: cell.rivals.n,
      on: cell.own.n,
      ...(cell.rivals.medianLift === undefined ? {} : { rlift: roundForPack(cell.rivals.medianLift) }),
      ...(cell.own.medianLift === undefined ? {} : { olift: roundForPack(cell.own.medianLift) }),
      ...(hooks.length === 0 ? {} : { hooks }),
      ...(exampleIds.length === 0 ? {} : { examples: exampleIds.map(contentRef) }),
    },
    actions: [targetedAction("open_matrix", ref)],
  };
}

// -------------------------------------------------------------------- Plan

/** Süre kovası etiketi rakam içerir; modele sözcükle yazılır. */
const DURATION_WORD: Record<DurationBucket, string> = {
  under_15: "çok kısa videolar",
  "15_30": "kısa videolar",
  "30_60": "orta uzunlukta videolar",
  "60_90": "uzun videolar",
  over_90: "çok uzun videolar",
};

function directionLabel(direction: FocusDirection): string {
  if (direction.group === "duration_bucket") return DURATION_WORD[direction.value as DurationBucket] ?? FOCUS_GROUP_PLAIN.duration_bucket;
  return hasDigit(direction.label) ? FOCUS_GROUP_PLAIN[direction.group] : direction.label;
}

/** Planın bugüne göre yeri: bu hafta · gelecek hafta (önceden üretilmiş) · geçmiş hafta. */
export type PlanRole = "this_week" | "next_week" | "past_week";

export function planRole(planWeekStart: string, currentWeekStart: string): PlanRole {
  return planWeekStart === currentWeekStart ? "this_week" : planWeekStart > currentWeekStart ? "next_week" : "past_week";
}

/** Plan olgusu (haftalık plan: gelecek haftanınki de olabilir). */
export function planEntry(plan: WeeklyPlan, role: PlanRole, tokens: TokenTable, rank: number): FactEntry {
  const ref = planRef(plan.weekStart);
  tokens.addRef("planned", ref, "int", plan.items.length);
  tokens.addRef("alts", ref, "int", plan.alternatives.length);
  const summary = clipForPrompt(plan.summary, SUMMARY_CHARS);
  return {
    section: "plans",
    rank,
    ref,
    confidence: plan.confidence ?? "low",
    json: {
      ref,
      role,
      status: plan.status,
      planned: plan.items.length,
      alts: plan.alternatives.length,
      ...(plan.confidence === undefined ? {} : { confidence: plan.confidence }),
      ...(summary === undefined ? {} : { summary }),
      directions: plan.sections.focus.directions.slice(0, 3).map((direction) => ({
        label: directionLabel(direction),
        group: FOCUS_GROUP_PLAIN[direction.group],
        confidence: direction.confidence,
        ownTried: direction.ownTried,
      })),
      items: plan.items.slice(0, 5).map((item) => {
        const slotDay = plan.sections.schedule.slots.find((slot) => slot.position === item.position)?.weekday;
        return { title: clipForPrompt(item.idea.title, TITLE_CHARS) ?? "", ...(slotDay === undefined ? {} : { day: weekdayName(slotDay) }) };
      }),
    },
    actions: [targetedAction("open_plan", ref)],
  };
}

/** Plan bölümü kararı sözcükle (sayı yok): yön için tuttu/tutmadı. */
function verdictWord(held: number, missed: number): string {
  if (held > missed) return "tuttu";
  if (missed > held) return "tutmadı";
  return held === 0 ? "ölçülemedi" : "karışık";
}

/** "Geçen hafta" olgusu: aynı plan ref'i (`plan:<hafta>`), sonuç özeti belirteçlerle. */
export function reviewEntry(review: WeekReview, tokens: TokenTable, rank: number): FactEntry {
  const ref = planRef(review.weekStart);
  const { summary } = review;
  tokens.addRef("planned", ref, "int", summary.planned);
  tokens.addRef("linked", ref, "int", summary.linked);
  tokens.addRef("measured_d7", ref, "int", summary.measuredD7);
  tokens.addRef("held", ref, "int", summary.held);
  tokens.addRef("missed", ref, "int", summary.missed);
  return {
    section: "plans",
    rank,
    ref,
    confidence: confidenceForSample(summary.measuredD7),
    json: {
      ref,
      role: "last_week_review",
      planned: summary.planned,
      linked: summary.linked,
      measured_d7: summary.measuredD7,
      held: summary.held,
      missed: summary.missed,
      directions: review.directions.slice(0, 3).map((direction) => ({ label: hasDigit(direction.label) ? FOCUS_GROUP_PLAIN[direction.group] : direction.label, verdict: verdictWord(direction.held, direction.missed) })),
    },
    actions: [targetedAction("open_plan", ref)],
  };
}

// ----------------------------------------------------------------- Bekleyen

const CHECKPOINT_WORD = { 1: "birinci gün", 3: "üçüncü gün", 7: "yedinci gün" } as const;

export function dueEntry(due: MeasurementDue, rank: number): FactEntry {
  const ref = dueRef(due.contentItemId, due.day);
  return {
    section: "due",
    rank,
    ref,
    confidence: "high",
    json: { ref, who: `@${due.ownerHandle}`, checkpoint: CHECKPOINT_WORD[due.day] },
    actions: [targetedAction("open_video", ref)],
  };
}

const LINK_HIGH_SCORE = 0.8;
const LINK_MEDIUM_SCORE = 0.6;

export function linkEntry(link: IdeaLink, rank: number): FactEntry {
  const ref = ideaRef(link.ideaId);
  const caption = clipForPrompt(link.content?.caption, CAPTION_CHARS);
  const confidence: ConfidenceLevel = link.score === undefined ? "low" : link.score >= LINK_HIGH_SCORE ? "high" : link.score >= LINK_MEDIUM_SCORE ? "medium" : "low";
  return {
    section: "links",
    rank,
    ref,
    confidence,
    json: { ref, ...(link.content === undefined ? {} : { who: `@${link.content.ownerHandle}` }), ...(caption === undefined ? {} : { caption }) },
    actions: [targetedAction("approve_link", ref)],
  };
}
