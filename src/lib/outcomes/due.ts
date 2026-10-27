/**
 * "Ölçüm zamanı geldi": ölçüm penceresi AÇIK ama o pencerede ölçümü olmayan kendi Reels'ler. Ücretsiz kontrol (Apify yok):
 * `measure:check`, `afterCollect` ve `/bu-hafta` şeridi bunu kullanır. Pencereler ayrık olduğu için bir Reels'in en çok bir
 * bekleyen noktası olur. Yayın tarihine göre eskiden yeniye (eşitlikte kimlik).
 */
import type { MeasurementDue } from "@/lib/domain/outcomes";
import { buildCheckpoints } from "@/lib/outcomes/checkpoints";
import type { OutcomeContent } from "@/lib/outcomes/content";
import { DAY_MS } from "@/lib/time";

/** Ölçüm penceresinin en geç kapanışı: D+7 penceresi yayından 10 gün sonra biter (`measure:now` aynı aralığı tarar). */
export const MEASURE_LOOKBACK_DAYS = 10;

/** Aday seçiminin alt sınırı (ISO): bundan eski yayının açık penceresi kalmaz. */
export function measureLookbackStart(now: Date): string {
  return new Date(now.getTime() - MEASURE_LOOKBACK_DAYS * DAY_MS).toISOString();
}

export function buildMeasurementDue(
  contents: readonly OutcomeContent[],
  now: Date,
  ideaIdByContent: ReadonlyMap<string, string> = new Map(),
): MeasurementDue[] {
  const due: MeasurementDue[] = [];
  for (const content of contents) {
    if (content.publishedAt === undefined) continue;
    const open = buildCheckpoints({
      publishedAt: content.publishedAt,
      snapshots: content.snapshots,
      followers: content.followers,
      baselineViews: content.baselineViews,
      baselineViewsKind: content.baselineViewsKind,
      now,
    }).find((checkpoint) => checkpoint.status === "due");
    if (open === undefined) continue;
    due.push({
      contentItemId: content.id,
      ownerHandle: content.ownerHandle,
      shortcode: content.shortcode,
      url: content.url,
      publishedAt: content.publishedAt,
      day: open.day,
      windowStart: open.windowStart,
      windowEnd: open.windowEnd,
      ideaId: ideaIdByContent.get(content.id),
    });
  }
  return due.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || a.contentItemId.localeCompare(b.contentItemId));
}
