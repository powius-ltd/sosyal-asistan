/**
 * Haftalık plan → yazdırılabilir rapor modeli (saf: depo okumaz, saat okumaz). Kurallar: müşteri jargonu yok (cümleler
 * `lib/plain-language.ts` sözlüğünden; serbest LLM metni jargon taşıyorsa düşer), ölçülemeyen değer cümleye girmez (0 yazılmaz),
 * hesap adı gömülmez (ad ve @kullanıcıadı girdiden gelir). Bölümü olmayan alan boş kalır; sayfa boş bölümü hiç çizmez.
 */
import { REPORT_COPY } from "@/lib/copy/report";
import { briefingFreshness, type Briefing } from "@/lib/domain/briefing";
import type { Idea } from "@/lib/domain/intel";
import { CHECKPOINT_DAYS, CHECKPOINT_LABEL, type Checkpoint, type WeekReview, type WeekReviewItem } from "@/lib/domain/outcomes";
import type { WeeklyPlan, WeeklyPlanItem } from "@/lib/domain/weekly-plan";
import { formatCompact, formatDate, formatElapsed, formatNumber } from "@/lib/format";
import { CONFIDENCE_PLAIN, checkpointPhrase, liftPhrase } from "@/lib/plain-language";
import { endStepOf, groupTitle, plainOrUndefined, slotText } from "@/lib/report/sentences";
import type {
  ReportCalendarRow,
  ReportDirection,
  ReportNote,
  ReportReview,
  ReportVideo,
  WeeklyReport,
} from "@/lib/report/types";

export interface BuildReportInput {
  plan: WeeklyPlan;
  workspaceName: string;
  /** Kendi hesabın kullanıcı adı ("@" olmadan). */
  handle?: string;
  /** Bir önceki haftanın planının sonucu; yoksa (ya da veri kaynağı desteklemiyorsa) bölüm çizilmez. */
  review?: WeekReview | null;
  /** En son brifing; yeterince tazeyse "Güncel notlar" olur. */
  briefing?: Briefing | null;
  /** İstekteki tek saat (bayatlık kuralı için). */
  now: Date;
}

// ----------------------------------------------------------------- Bölümler

function directionsOf(plan: WeeklyPlan): ReportDirection[] {
  return plan.sections.focus.directions.map((direction) => {
    const parts: string[] = [];
    const phrase = liftPhrase(direction.impact);
    const sample = formatNumber(direction.sampleSize);
    if (phrase !== undefined) {
      const rivals = REPORT_COPY.directionRivals(phrase);
      parts.push(sample === undefined ? `${rivals}.` : `${rivals} ${REPORT_COPY.directionSample(sample)}.`);
    }
    parts.push(direction.ownTried ? REPORT_COPY.directionTried : REPORT_COPY.directionNotTried);
    parts.push(REPORT_COPY.directionConfidence(CONFIDENCE_PLAIN[direction.confidence]));
    return { title: groupTitle(direction.group, direction.value, direction.label), sentence: parts.join(" ") };
  });
}

function avoidOf(plan: WeeklyPlan): string[] {
  const lines: string[] = [];
  for (const entry of plan.sections.avoid.entries) {
    // Niş dışı satırı iç veri temizliğidir (kullanıcı adı + oran); müşteri raporuna girmez.
    if (entry.kind !== "low_lift" || entry.group === "off_niche") continue;
    const title = groupTitle(entry.group, entry.value, entry.label);
    const phrase = liftPhrase(entry.medianLift);
    const sample = formatNumber(entry.sampleSize);
    lines.push(phrase === undefined || sample === undefined ? title : `${title}. ${REPORT_COPY.avoidSentence(phrase, sample)}`);
  }
  return lines;
}

/** Zamana göre (atanmamışlar sonda), eşitlikte plan sırasına göre. */
function chronological(items: readonly WeeklyPlanItem[]): WeeklyPlanItem[] {
  const at = (item: WeeklyPlanItem) => (item.slotAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(item.slotAt));
  return [...items].sort((a, b) => {
    const [x, y] = [at(a), at(b)];
    const byTime = Number.isNaN(x) || Number.isNaN(y) || x === y ? 0 : x < y ? -1 : 1;
    return byTime || (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
  });
}

/** Script satır sonlarından paragraflara; script yoksa çekim adımları. İkisi de yoksa undefined. */
function bodyOf(idea: Idea): ReportVideo["body"] {
  const paragraphs = (idea.details.script ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (paragraphs.length > 0) return { kind: "script", paragraphs };
  const steps = idea.scriptOutline.map((step) => step.trim()).filter((step) => step !== "");
  return steps.length > 0 ? { kind: "outline", paragraphs: steps } : undefined;
}

function videoOf(item: WeeklyPlanItem, position: number, plan: WeeklyPlan): ReportVideo {
  const { idea } = item;
  const slot = slotText(item.slotAt, plan.weekStart, plan.sections.schedule.audienceTimeZone);
  const elapsed = formatElapsed(idea.details.targetDurationSec);
  const [opening, ...otherOpenings] = idea.hooks.map((hook) => hook.trim()).filter((hook) => hook !== "");
  return {
    position,
    title: idea.title,
    when: slot === undefined ? undefined : `${slot.day} · ${slot.timeLines.join(" / ")}`,
    duration: elapsed === undefined ? undefined : REPORT_COPY.videoDuration(elapsed),
    summary: plainOrUndefined(idea.rationale),
    opening,
    otherOpenings,
    body: bodyOf(idea),
    caption: idea.details.captionDraft?.trim() || undefined,
  };
}

function calendarOf(items: readonly WeeklyPlanItem[], plan: WeeklyPlan): ReportCalendarRow[] {
  return items.map((item) => {
    const slot = slotText(item.slotAt, plan.weekStart, plan.sections.schedule.audienceTimeZone);
    return {
      day: slot?.day,
      timeLines: slot?.timeLines ?? [],
      title: item.idea.title,
      endStep: endStepOf(item.idea.details.ctaType),
    };
  });
}

// ------------------------------------------------------------- Geçen hafta

const checkpointOf = (item: WeekReviewItem, day: Checkpoint["day"]) => item.checkpoints.find((c) => c.day === day);

/** Bir plan öğesinin sonucu: en olgun ölçümün cümlesi (7. gün farkı → 3. gün → 1. gün izlenmesi), yoksa durum cümlesi. */
function reviewOutcome(item: WeekReviewItem): string {
  for (const day of [...CHECKPOINT_DAYS].reverse()) {
    const checkpoint = checkpointOf(item, day);
    if (checkpoint?.status !== "measured") continue;
    const lift = liftPhrase(checkpoint.lift);
    if (lift !== undefined) return `${checkpointPhrase(day)}: ${lift}`;
    const views = formatCompact(checkpoint.views);
    if (views !== undefined) return REPORT_COPY.reviewViews(CHECKPOINT_LABEL[day], views);
  }
  return item.link?.status === "confirmed" ? REPORT_COPY.reviewNotMeasured : REPORT_COPY.reviewNotPublished;
}

function reviewOf(review: WeekReview | null | undefined): ReportReview | undefined {
  if (!review || review.items.length === 0) return undefined;
  const directionLines = review.directions
    .filter((d) => d.held + d.missed > 0)
    .flatMap((d) => {
      const held = formatNumber(d.held);
      const missed = formatNumber(d.missed);
      return held === undefined || missed === undefined ? [] : [REPORT_COPY.reviewDirectionLine(groupTitle(d.group, d.value, d.label), held, missed)];
    });
  return {
    weekStart: review.weekStart,
    rows: review.items.map((item) => ({ title: item.title, outcome: reviewOutcome(item) })),
    directionLines,
  };
}

// ------------------------------------------------------------------- Notlar

/**
 * Brifing yalnız tazeyse ve "ne değişti / ne tuttu / fırsat" maddeleriyle: "sıradaki adım" ve "bekleyen" maddeleri panelde yapılacak işi
 * (onay, ölçüm, komut) söyler, kâğıtta anlamsızdır; komut eylemli madde de yönetici işidir.
 */
function notesOf(briefing: Briefing | null | undefined, now: Date): ReportNote[] {
  if (!briefing || briefingFreshness(briefing.generatedAt, { now }).stale) return [];
  return briefing.items
    .filter((item) => item.kind !== "pending" && item.kind !== "next_step" && item.action?.type !== "run_cmd")
    .map((item) => ({ headline: item.headline, body: item.body }));
}

// --------------------------------------------------------------------- Ana

export function buildWeeklyReport(input: BuildReportInput): WeeklyReport {
  const { plan } = input;
  const ordered = chronological(plan.items);
  const count = formatNumber(plan.items.length) ?? String(plan.items.length);
  const calendar = calendarOf(ordered, plan);
  return {
    weekStart: plan.weekStart,
    workspaceName: input.workspaceName,
    handle: input.handle,
    preparedOn: formatDate(plan.generatedAt),
    lead: plainOrUndefined(plan.summary) ?? REPORT_COPY.leadFallback(count),
    directions: directionsOf(plan),
    calendar,
    showEndStepColumn: calendar.some((row) => row.endStep !== undefined),
    avoid: avoidOf(plan),
    review: reviewOf(input.review),
    notes: notesOf(input.briefing, input.now),
    videos: ordered.map((item, index) => videoOf(item, index + 1, plan)),
    fewSamples: plan.confidence === "low",
  };
}
