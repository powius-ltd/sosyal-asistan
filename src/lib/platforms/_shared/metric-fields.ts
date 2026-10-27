/**
 * Ölçülemeyen metrik listesi — platformdan bağımsız.
 *
 * `missingFields` içerik için METRİK adlarını taşır (`views`, `likes`, …); UI "Ölçülemeyenler" listesi
 * ve depo sözleşmesi bu adları bekler: listedeki her metrik `metrics`'te `undefined` olmalıdır.
 * Herkese açık kazıma her zaman paylaşım/kaydetme/erişim/izlenme süresi vermez — bu alanlar listede
 * yer alır ki ekran "0" değil "—" + sebep göstersin.
 */
import type { ContentFormat, NormalizedMetrics } from "@/lib/platforms/types";

export const METRIC_FIELDS = ["views", "likes", "comments", "shares", "saves", "reach", "avgWatchSec"] as const;

export const isVideoFormat = (format: ContentFormat): boolean => format === "short_video" || format === "long_video";

/** Yazılmamış metrikler. Ortalama izlenme süresi video olmayan formatta "uygulanamaz" olduğundan listeye girmez. */
export function missingMetricFields(metrics: NormalizedMetrics, format: ContentFormat): string[] {
  return METRIC_FIELDS.filter((field) => metrics[field] === undefined && (field !== "avgWatchSec" || isVideoFormat(format)));
}
