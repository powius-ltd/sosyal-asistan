/**
 * Zaman metrikleri: kadans, gün × saat dağılımı, trend, en iyi paylaşım saati —
 * Python `core/metrics/temporal.py` paritesi.
 *
 * Sapma (bilinçli): Python gün/saati zaman damgasının kendi diliminde (Apify'da UTC) okur;
 * burada workspace saat dilimi parametredir (varsayılan Europe/Istanbul). `timeZone: "UTC"`
 * verilince Python çıktısıyla birebir aynıdır.
 */
import { formatInTimeZone } from "date-fns-tz";

import { DEFAULT_TIMEZONE } from "@/lib/format";
import { isValidDate } from "@/lib/metrics/dates";
import { engagementOf, engagementRates } from "@/lib/metrics/engagement";
import { median, pyRound } from "@/lib/metrics/stats";
import type { MetricItem } from "@/lib/metrics/types";
import { filterDominantViewsKind, type ViewsSample } from "@/lib/metrics/views-summary";
import type { ViewsKind } from "@/lib/platforms/types";
import { DAY_MS, WEEKDAY_LABELS, type WeekdayLabel } from "@/lib/time";

export { WEEKDAY_LABELS, type WeekdayLabel };

/** JS `getDay()` (Paz = 0 … Cmt = 6) → Python `weekday()` (Pzt = 0 … Paz = 6). */
export function pyWeekdayFromJsDay(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/** Tarihin verilen saat dilimindeki Python-weekday'i (Pzt = 0) ve saati (0–23). */
export function zonedWeekdayHour(d: Date, timeZone: string = DEFAULT_TIMEZONE): { weekday: number; hour: number } {
  // date-fns "i" = ISO gün (Pzt = 1 … Paz = 7), "H" = 0–23. Sistem saat diliminden bağımsız.
  const [isoDay, hour] = formatInTimeZone(d, timeZone, "i H").split(" ").map(Number);
  return { weekday: isoDay - 1, hour };
}

function timestamps(items: readonly MetricItem[]): Date[] {
  return items.map((it) => it.publishedAt).filter(isValidDate);
}

/** Python `timedelta.days` (pozitif farkta tabana yuvarlanmış gün). */
function wholeDays(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

export interface CadenceStats {
  totalItems: number;
  spanDays?: number;
  postsPerWeek?: number;
  longestGapDays?: number;
}

/** Paylaşım kadansı. Tarihi bilinen içerik < 2 → yalnız toplam sayı. */
export function computeCadence(items: readonly MetricItem[]): CadenceStats {
  const ts = timestamps(items)
    .map((d) => d.getTime())
    .sort((a, b) => a - b);
  if (ts.length < 2) return { totalItems: items.length };

  const spanDays = wholeDays(ts[ts.length - 1] - ts[0]) || 1;
  let longestGapDays = 0;
  for (let i = 0; i < ts.length - 1; i++) {
    longestGapDays = Math.max(longestGapDays, wholeDays(ts[i + 1] - ts[i]));
  }
  return {
    totalItems: items.length,
    spanDays,
    postsPerWeek: pyRound((ts.length / spanDays) * 7, 2),
    longestGapDays,
  };
}

/** Gün (Pzt..Paz) × saat → paylaşım sayısı; yalnız dolu saatler yazılır. */
export type Heatmap = Record<WeekdayLabel, Record<number, number>>;

export function computeHeatmap(items: readonly MetricItem[], timeZone: string = DEFAULT_TIMEZONE): Heatmap {
  const heatmap = Object.fromEntries(WEEKDAY_LABELS.map((d) => [d, {}])) as Heatmap;
  for (const d of timestamps(items)) {
    const { weekday, hour } = zonedWeekdayHour(d, timeZone);
    const row = heatmap[WEEKDAY_LABELS[weekday]];
    row[hour] = (row[hour] ?? 0) + 1;
  }
  return heatmap;
}

/** Python "yukarı" | "aşağı" | "sabit"; "bilinmiyor" → undefined. */
export type TrendDirection = "up" | "down" | "flat";

export interface TrendComparison {
  recentMedianEr?: number;
  previousMedianEr?: number;
  direction?: TrendDirection;
}

function medianEr(bucket: readonly MetricItem[], followers: number): number | undefined {
  const m = median(engagementRates(bucket, followers));
  return m === undefined ? undefined : pyRound(m, 4);
}

/**
 * Son `windowDays` vs önceki `windowDays` — medyan ER karşılaştırması, eşik ±%10.
 * Python gibi referans an "şimdi" değil EN SON içeriğin tarihidir (sonuç saate bağlı değil).
 */
export function computeTrend(
  items: readonly MetricItem[],
  followers: number | undefined,
  o: { windowDays?: number } = {},
): TrendComparison {
  const windowMs = (o.windowDays ?? 30) * DAY_MS;
  const ts = timestamps(items).map((d) => d.getTime());
  if (ts.length === 0 || !followers || !(followers > 0)) return {};

  const now = ts.reduce((a, b) => Math.max(a, b));
  const recentCut = now - windowMs;
  const prevCut = now - 2 * windowMs;
  const inRange = (it: MetricItem, from: number, to: number) =>
    isValidDate(it.publishedAt) && it.publishedAt.getTime() > from && it.publishedAt.getTime() <= to;
  const recent = items.filter((it) => inRange(it, recentCut, now));
  const previous = items.filter((it) => inRange(it, prevCut, recentCut));

  const recentMedianEr = medianEr(recent, followers);
  const previousMedianEr = medianEr(previous, followers);
  let direction: TrendDirection | undefined;
  if (recentMedianEr !== undefined && previousMedianEr !== undefined) {
    if (recentMedianEr > previousMedianEr * 1.1) direction = "up";
    else if (recentMedianEr < previousMedianEr * 0.9) direction = "down";
    else direction = "flat";
  }
  return { recentMedianEr, previousMedianEr, direction };
}

export interface HourStat {
  /** Workspace saat dilimindeki saat (0–23). */
  hour: number;
  posts: number;
  medianEngagement: number;
}

/**
 * En iyi paylaşım saatleri (Python'da yok; ARASTIRMA.md §3 "gün × saat"ten türetildi):
 * saat başına medyan etkileşim, en az `minPosts` (3) paylaşımı olan saatler, azalan sırada.
 * n = 2'de medyan = ortalama olur ve tek viral içerik saati başa taşır; eşik bu yüzden 3.
 */
export function bestPostingHours(
  items: readonly MetricItem[],
  o: { timeZone?: string; minPosts?: number } = {},
): HourStat[] {
  const timeZone = o.timeZone ?? DEFAULT_TIMEZONE;
  const minPosts = o.minPosts ?? 3;
  const byHour = new Map<number, number[]>();
  for (const it of items) {
    const e = engagementOf(it);
    if (e === undefined || !isValidDate(it.publishedAt)) continue;
    const { hour } = zonedWeekdayHour(it.publishedAt, timeZone);
    const bucket = byHour.get(hour);
    if (bucket) bucket.push(e);
    else byHour.set(hour, [e]);
  }
  const out: HourStat[] = [];
  for (const [hour, values] of [...byHour].sort((a, b) => a[0] - b[0])) {
    const m = median(values);
    if (values.length >= minPosts && m !== undefined) {
      out.push({ hour, posts: values.length, medianEngagement: pyRound(m, 1) });
    }
  }
  return out.sort((a, b) => b.medianEngagement - a.medianEngagement);
}

/** Gün × saat dilimi için asgari paylaşım sayısı (`bestPostingHours` ile aynı gerekçe: n = 2'de medyan = ortalama). */
export const BEST_SLOT_MIN_POSTS = 3;

export interface SlotSample extends ViewsSample {
  publishedAt?: Date;
}

export interface SlotStat {
  /** Workspace saat diliminde haftanın günü: Pzt = 0 … Paz = 6 (`WEEKDAY_LABELS` sırası). */
  weekday: number;
  /** Workspace saat diliminde saat (0–23). */
  hour: number;
  /** Bu dilimde yayınlanıp medyana giren kısa video sayısı. */
  posts: number;
  medianViews: number;
}

export interface BestSlots {
  /** Medyan izlenmeye göre azalan (eşitlikte daha çok paylaşım, sonra gün/saat); yeterli veri yoksa boş. */
  slots: SlotStat[];
  /** Hesabın yapıldığı views türü (en sık görülen); uygun içerik yoksa undefined. */
  viewsKind?: ViewsKind;
  /** Analize giren (tarihi geçerli, uygun) kısa video sayısı; "yetersiz veri" mesajı için. */
  considered: number;
}

/**
 * En iyi paylaşım gün × saat dilimleri (kısa video, medyan izlenme). Yalnız `short_video`, izlenmesi ölçülmüş, tarihi
 * geçerli içerikler ve YALNIZ en sık görülen `viewsKind` girer (türler karıştırılmaz, `filterDominantViewsKind`).
 * Dilim = workspace saat diliminde (gün, saat); en az `minPosts` (3) paylaşımı olan dilimler, ilk `limit` (3) tanesi.
 * Yeterli dilim yoksa `slots` boştur — çağıran "ölçülemedi + sebep" gösterir, 0 ya da rastgele bir dilim değil.
 */
export function bestPostingSlots(
  items: readonly SlotSample[],
  o: { timeZone?: string; minPosts?: number; limit?: number } = {},
): BestSlots {
  const timeZone = o.timeZone ?? DEFAULT_TIMEZONE;
  const minPosts = o.minPosts ?? BEST_SLOT_MIN_POSTS;
  const dated = items.filter((it): it is SlotSample & { publishedAt: Date } => isValidDate(it.publishedAt));
  const { viewsKind, items: usable } = filterDominantViewsKind(dated);

  const bySlot = new Map<string, { weekday: number; hour: number; views: number[] }>();
  for (const it of usable) {
    const { weekday, hour } = zonedWeekdayHour(it.publishedAt, timeZone);
    const key = `${weekday}-${hour}`;
    const slot = bySlot.get(key);
    if (slot) slot.views.push(it.views as number);
    else bySlot.set(key, { weekday, hour, views: [it.views as number] });
  }
  const slots: SlotStat[] = [];
  for (const { weekday, hour, views } of bySlot.values()) {
    const m = median(views);
    if (views.length >= minPosts && m !== undefined) slots.push({ weekday, hour, posts: views.length, medianViews: m });
  }
  slots.sort((a, b) => b.medianViews - a.medianViews || b.posts - a.posts || a.weekday - b.weekday || a.hour - b.hour);
  return { slots: slots.slice(0, o.limit ?? 3), viewsKind, considered: usable.length };
}
