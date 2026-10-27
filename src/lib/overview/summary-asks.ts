/**
 * "Senden ne bekliyoruz" (tasarım §3): öncelik sırasıyla en çok `SUMMARY_ASKS_MAX` iş, her biri tek cümle + tek düğme. Sıra:
 * hesabı bağla · onay bekleyen yayın · onay bekleyen eşleşme önerisi · sıradaki çekim · ölçümü gelen videolar. Ton `persona.ts`:
 * "sen", birinci tekil, kısa, ünlemsiz. Yönetici bilgisi (aylık ölçüm bütçesi) yalnız `operator` iken söylenir.
 */
import type { CheckpointDay } from "@/lib/domain/outcomes";
import type { WeeklyPlan, WeeklyPlanItem } from "@/lib/domain/weekly-plan";
import { DEFAULT_TIMEZONE, formatNumber, formatWeekdayTime, timeZoneLabel } from "@/lib/format";
import { nextPlanItem, planItemStatuses } from "@/lib/overview/plan-item-status";
import { SUMMARY_ASKS_MAX, type OverviewSummaryInput, type SummaryAsk } from "@/lib/overview/types";
import { ROUTES, thisWeekFor } from "@/lib/routes";
import { truncateText } from "@/lib/text";

/** Hiçbir iş yokken söylenen cümle. */
export const NO_ASKS_TEXT = "Şu an senden bir şey beklemiyorum.";

const TITLE_MAX_CHARS = 80;

/** "3. ve 7. gün": tekrarsız, küçükten büyüğe. */
export function checkpointDaysPhrase(days: readonly CheckpointDay[]): string | undefined {
  const unique = [...new Set(days)].sort((a, b) => a - b).map((day) => `${day}.`);
  if (unique.length === 0) return undefined;
  const head = unique.length === 1 ? unique[0] : `${unique.slice(0, -1).join(", ")} ve ${unique[unique.length - 1]}`;
  return `${head} gün`;
}

/** "Per 19:00 ET (Cum 02:00 İstanbul)": hedef kitle saati + İstanbul karşılığı (dilim aynıysa tek). */
function slotPhrase(plan: WeeklyPlan, item: WeeklyPlanItem): string | undefined {
  if (item.slotAt === undefined) return undefined;
  const zone = plan.sections.schedule.audienceTimeZone;
  const audience = formatWeekdayTime(item.slotAt, zone);
  if (audience === undefined) return undefined;
  const base = `${audience} ${timeZoneLabel(zone)}`;
  if (zone === DEFAULT_TIMEZONE) return base;
  const istanbul = formatWeekdayTime(item.slotAt, DEFAULT_TIMEZONE);
  return istanbul === undefined ? base : `${base} (${istanbul} ${timeZoneLabel(DEFAULT_TIMEZONE)})`;
}

export function connectAccountAsk(input: OverviewSummaryInput): SummaryAsk | undefined {
  if (input.accounts === undefined || input.accounts.length > 0) return undefined;
  return {
    id: "connect_account",
    text: "Hesabını bağla; bağlayınca ilk bakışımı yaparım.",
    action: { label: "Ayarlar'ı aç", href: ROUTES.settings },
  };
}

export function approvePublishAsk(input: OverviewSummaryInput): SummaryAsk | undefined {
  const count = input.pendingApproval;
  if (count === undefined || count <= 0) return undefined;
  return {
    id: "approve_publish",
    text: `${formatNumber(count)} yayın senin onayını bekliyor.`,
    action: { label: "Yayınları aç", href: ROUTES.publish },
  };
}

export function confirmLinksAsk(input: OverviewSummaryInput): SummaryAsk | undefined {
  const count = input.suggestedLinks;
  if (count === undefined || count <= 0) return undefined;
  return {
    id: "confirm_links",
    text: `Yayınladığın ${formatNumber(count)} videonun hangi fikirden çıktığını tahmin ettim; doğru mu bakar mısın?`,
    action: { label: "Fikirleri aç", href: ROUTES.ideas },
  };
}

export function shootNextAsk(input: OverviewSummaryInput): SummaryAsk | undefined {
  const { plan } = input;
  if (!plan) return undefined;
  const item = nextPlanItem(plan, planItemStatuses(plan, input.review, input.currentWeekStart));
  if (!item) return undefined;
  const slot = slotPhrase(plan, item);
  return {
    id: "shoot_next",
    text: `Sıradaki video: “${truncateText(item.idea.title, TITLE_MAX_CHARS)}”.${slot === undefined ? "" : ` Planlanan yayın: ${slot}.`}`,
    action: { label: "Senaryoyu aç", href: `${ROUTES.ideas}?id=${encodeURIComponent(item.ideaId)}` },
  };
}

export function measurementAsk(input: OverviewSummaryInput): SummaryAsk | undefined {
  const days = input.measurementDueDays;
  if (days === undefined || days.length === 0) return undefined;
  const count = formatNumber(days.length);
  if (input.operator && input.measureCapApproved === false) {
    return {
      id: "measurement",
      text: `${count} videonun sonucunu ölçebilmem için aylık ölçüm bütçesini onaylaman gerekiyor.`,
      action: { label: "Ayarlar'ı aç", href: ROUTES.settings },
    };
  }
  return {
    id: "measurement",
    text: `${count} videonun ${checkpointDaysPhrase(days)} sonucu bekleniyor.`,
    action: { label: "Haftaya bak", href: thisWeekFor(input.plan?.weekStart) },
  };
}

const ASK_BUILDERS = [connectAccountAsk, approvePublishAsk, confirmLinksAsk, shootNextAsk, measurementAsk] as const;

/** Öncelik sırasıyla işler; her biri kendi verisi okunamadıysa (undefined) hiç çıkmaz. */
export function buildAsks(input: OverviewSummaryInput): SummaryAsk[] {
  const asks: SummaryAsk[] = [];
  for (const build of ASK_BUILDERS) {
    const ask = build(input);
    if (ask) asks.push(ask);
  }
  return asks.slice(0, SUMMARY_ASKS_MAX);
}
