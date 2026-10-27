/**
 * Paylaşım deseni (LLM'siz): aralık/sıklık, en sık gün×saat dilimleri ve saat-dilimi profili. Gün ve saat HEDEF KİTLE saat
 * diliminde hesaplanır (`lib/insights/audience-zone.ts`): UTC'de Pazar 23:00 olan paylaşım New York'ta Pazar 19:00'dur; İstanbul'da
 * Pazartesi 02:00 olurdu. Gün sınırı bu yüzden dilimle birlikte gelir.
 *
 * `postingHours` (yalnız SAAT, gün yok): "noelle 10/10 videoyu 07–08 ET'de" bulgusu gün×saat diliminde görünmez (her gün ayrı
 * dilime düşer). `PostingPattern.commonHours` bunun en sık 3 saatidir; haftalık plan takvimi (`lib/insights/schedule.ts`) tüm
 * profili kullanır.
 */
import type { ContentItem } from "@/lib/domain/content";
import type { PostingHour, PostingPattern, PostingSlot } from "@/lib/domain/insights";
import { definedNumbers, usableLift, viewsSample } from "@/lib/data/views/insights-groups";
import { median } from "@/lib/metrics/stats";
import { computeCadence, zonedWeekdayHour } from "@/lib/metrics/temporal";
import { filterDominantViewsKind } from "@/lib/metrics/views-summary";
import { DAY_MS } from "@/lib/time";

const TOP_SLOTS = 3;
const TOP_HOURS = 3;
const round1 = (value: number) => Math.round(value * 10) / 10;

interface DatedVideo {
  c: ContentItem;
  at: number;
}

/** Tarihi geçerli videolar (yayın anı ms). */
function datedVideos(videos: readonly ContentItem[]): DatedVideo[] {
  return videos.flatMap((c) => {
    const at = c.publishedAt === undefined ? Number.NaN : Date.parse(c.publishedAt);
    return Number.isNaN(at) ? [] : [{ c, at }];
  });
}

/** Saat diliminde bir saat (0–23): kaç video, payı ve ölçülebiliyorsa medyan izlenme/lift. Gün ayrımı yok. Tip `domain/insights.ts`'te. */
export type PostingHourStat = PostingHour;

/** Saat profili: n azalan, eşitlikte saat artan. Tarihli video yoksa []. `timeZone` hedef kitle dilimidir. */
export function postingHours(videos: readonly ContentItem[], timeZone: string): PostingHourStat[] {
  const dated = datedVideos(videos);
  if (dated.length === 0) return [];
  const dominant = filterDominantViewsKind(videos.map(viewsSample)).viewsKind;
  const byHour = new Map<number, { views: number[]; items: ContentItem[] }>();
  for (const { c, at } of dated) {
    const { hour } = zonedWeekdayHour(new Date(at), timeZone);
    const bucket = byHour.get(hour) ?? { views: [], items: [] };
    bucket.items.push(c);
    if (c.metrics.views !== undefined && c.metrics.viewsKind === dominant) bucket.views.push(c.metrics.views);
    byHour.set(hour, bucket);
  }
  return [...byHour]
    .map(([hour, { views, items }]): PostingHourStat => {
      const lifts = definedNumbers(items.map(usableLift));
      return { hour, n: items.length, share: items.length / dated.length, medianViews: median(views), liftN: lifts.length, medianLift: median(lifts) };
    })
    .sort((a, b) => b.n - a.n || a.hour - b.hour);
}

/** Aralık/sıklık + en sık gün×saat dilimleri. `nowMs` = tek saat ("son paylaşımdan bu yana gün"). */
export function postingPattern(videos: readonly ContentItem[], timeZone: string, nowMs: number): PostingPattern {
  const dated = datedVideos(videos);
  const sorted = dated.map((d) => d.at).sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((at, i) => (at - sorted[i]) / DAY_MS);
  const gapMedian = median(gaps);
  const dominant = filterDominantViewsKind(videos.map(viewsSample)).viewsKind;

  const slots = new Map<string, { weekday: number; hour: number; n: number; views: number[] }>();
  for (const { c, at } of dated) {
    const { weekday, hour } = zonedWeekdayHour(new Date(at), timeZone);
    const key = `${weekday}-${hour}`;
    const slot = slots.get(key) ?? { weekday, hour, n: 0, views: [] };
    slot.n += 1;
    if (c.metrics.views !== undefined && c.metrics.viewsKind === dominant) slot.views.push(c.metrics.views);
    slots.set(key, slot);
  }
  const commonSlots: PostingSlot[] = [...slots.values()]
    .map((s) => ({ weekday: s.weekday, hour: s.hour, n: s.n, medianViews: median(s.views) }))
    .sort((a, b) => b.n - a.n || (b.medianViews ?? -1) - (a.medianViews ?? -1) || a.weekday - b.weekday || a.hour - b.hour)
    .slice(0, TOP_SLOTS);

  const cadence = computeCadence(dated.map(({ c, at }) => ({ id: c.id, format: c.format, publishedAt: new Date(at) })));
  return {
    postsPerWeek: cadence.postsPerWeek,
    medianGapDays: gapMedian === undefined ? undefined : round1(gapMedian),
    daysSinceLastPost: sorted.length > 0 ? Math.max(0, Math.floor((nowMs - sorted[sorted.length - 1]) / DAY_MS)) : undefined,
    commonSlots,
    commonHours: postingHours(videos, timeZone).slice(0, TOP_HOURS),
    topSlotShare: commonSlots.length > 0 && dated.length > 0 ? commonSlots[0].n / dated.length : undefined,
  };
}
