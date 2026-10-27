/**
 * Ham Instagram öğesinden içerik biçimi. Aktörlere göre iki alan taşır:
 *  - `productType`: `clips` (reel) · `igtv` · `carousel_container` · `feed`
 *  - `type`       : `Video` · `Image` · `Sidecar`
 * Sabit kural (sırayla): clips → kısa video · igtv → uzun video · carousel/Sidecar → karusel ·
 * video sinyali (type Video, videoUrl, oynatma sayısı, süre) → süre > 180 sn ise uzun, değilse kısa ·
 * Image / feed → görsel · hiçbiri → belirlenemedi (öğe `notItems`'a düşer).
 */
import { firstDefined, pickNumber, pickString, type RawItem } from "@/lib/platforms/_shared/field-pick";
import type { ContentFormat } from "@/lib/platforms/types";

/** Reels üst süresi; ölçülmüş süre bunu aşan (ve `clips` olmayan) video "uzun video" sayılır. */
export const SHORT_VIDEO_MAX_SEC = 180;

const lower = (value: string | undefined): string => (value ?? "").toLowerCase();

/** Öğe bir video mu (biçimden bağımsız sinyal). */
export function hasVideoSignal(item: RawItem): boolean {
  return (
    lower(pickString(item, ["type"])) === "video" ||
    firstDefined(item, ["videoUrl"]) !== undefined ||
    pickNumber(item, ["videoPlayCount", "videoDuration"]) !== undefined
  );
}

export function resolveFormat(item: RawItem): ContentFormat | undefined {
  const product = lower(pickString(item, ["productType"]));
  const type = lower(pickString(item, ["type"]));

  if (product === "clips") return "short_video";
  if (product === "igtv") return "long_video";
  if (product === "carousel_container" || type.includes("sidecar") || type.includes("carousel")) return "carousel";
  if (hasVideoSignal(item)) {
    const duration = pickNumber(item, ["videoDuration", "duration"]);
    return duration !== undefined && duration > SHORT_VIDEO_MAX_SEC ? "long_video" : "short_video";
  }
  if (type === "image" || product === "feed") return "image";
  return undefined;
}
