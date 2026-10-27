/** Rapor cümleleri: yapılandırılmış plan verisini düz Türkçeye çevirir (panel jargonu yok; ölçülemeyen değer cümleye girmez). */
import { REPORT_COPY } from "@/lib/copy/report";
import type { CtaType } from "@/lib/domain/taxonomy";
import { weekDayKeys, type FocusGroup } from "@/lib/domain/weekly-plan";
import {
  DEFAULT_TIMEZONE,
  formatDayMonth,
  formatTime,
  LOCALE,
  timeZoneLabel,
  toDayKey,
} from "@/lib/format";
import { CTA_TYPE_PLAIN, hookTypePlain, PANEL_JARGON } from "@/lib/plain-language";
import { WEEKDAY_NAMES } from "@/lib/time";

/** Cümlenin ilk harfini büyütür (Türkçe kurallarıyla: "ı" → "I", "i" → "İ"). */
export function capitalizeFirst(text: string): string {
  const [head = "", ...rest] = Array.from(text);
  return head.toLocaleUpperCase(LOCALE) + rest.join("");
}

/** Serbest metin (LLM gerekçesi vb.) panel jargonu taşımıyorsa metni, taşıyorsa undefined döndürür: müşteri raporuna jargon girmez. */
export function plainOrUndefined(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  return PANEL_JARGON.test(trimmed) ? undefined : trimmed;
}

/** Yön / kaçın grubunun müşteriye söylenen başlığı. Etiket (`label`) zaten Türkçe ad ise (süre, konu) olduğu gibi kullanılır. */
export function groupTitle(group: FocusGroup, value: string, label: string): string {
  switch (group) {
    case "hook_type":
      return capitalizeFirst(hookTypePlain(value));
    case "cta_type": {
      const phrase = (CTA_TYPE_PLAIN as Record<string, string | undefined>)[value];
      return phrase === undefined ? label : capitalizeFirst(REPORT_COPY.endStepDirection(phrase));
    }
    case "duration_bucket":
      return capitalizeFirst(REPORT_COPY.durationDirection(label));
    case "topic_cluster":
      return label;
  }
}

/** Videonun sonundaki adım ("Yoruma kelime yazma"); adım yok (`none`) ya da belirsizse undefined. */
export function endStepOf(ctaType: CtaType | undefined): string | undefined {
  if (ctaType === undefined || ctaType === "none") return undefined;
  return capitalizeFirst(CTA_TYPE_PLAIN[ctaType]);
}

export interface SlotText {
  /** "Pazartesi 12 Eki" (haftanın dışındaysa yalnız "12 Eki"). */
  day: string;
  /** Hedef kitle saati; dilim farklıysa ikinci satır İstanbul karşılığı. */
  timeLines: string[];
}

/**
 * Paylaşım anı → gün + saat satırları. Gün hedef kitle diliminde bulunur; İstanbul günü farklıysa ("ertesi gün") satırda söylenir,
 * böylece iki dilim yan yana okunurken gün kayması saklanmaz. Okunamayan zaman → undefined.
 */
export function slotText(slotAt: string | undefined, weekStart: string, audienceTimeZone: string): SlotText | undefined {
  if (slotAt === undefined) return undefined;
  const audienceDay = toDayKey(slotAt, audienceTimeZone);
  const audienceTime = formatTime(slotAt, audienceTimeZone);
  if (audienceDay === undefined || audienceTime === undefined) return undefined;
  const dayMonth = formatDayMonth(audienceDay, "UTC") ?? audienceDay;
  const weekdayIndex = weekDayKeys(weekStart).indexOf(audienceDay);
  const day = weekdayIndex === -1 ? dayMonth : `${WEEKDAY_NAMES[weekdayIndex]} ${dayMonth}`;
  const timeLines = [`${audienceTime} ${timeZoneLabel(audienceTimeZone)}`];
  if (audienceTimeZone !== DEFAULT_TIMEZONE) {
    const istanbulDay = toDayKey(slotAt, DEFAULT_TIMEZONE);
    const istanbulTime = formatTime(slotAt, DEFAULT_TIMEZONE);
    if (istanbulTime !== undefined) {
      const shift =
        istanbulDay === undefined || istanbulDay === audienceDay
          ? ""
          : ` (${istanbulDay > audienceDay ? REPORT_COPY.nextDay : REPORT_COPY.previousDay})`;
      timeLines.push(`${istanbulTime} ${timeZoneLabel(DEFAULT_TIMEZONE)}${shift}`);
    }
  }
  return { day, timeLines };
}
