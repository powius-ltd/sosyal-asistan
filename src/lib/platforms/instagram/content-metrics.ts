/**
 * Ham Instagram öğesinden metrikler. Kurallar:
 *
 * - **İzlenme türü ayrıdır (karışmaz).** `videoPlayCount` (oynatma) → `ig_play_count`;
 *   `videoViewCount` (görüntüleme) → `ig_view_count`. SABİT KURAL: oynatma sayısı varsa o seçilir
 *   (Instagram'ın gösterdiği "izlenme" budur); yoksa görüntüleme sayısı. İkisi de varsa seçilmeyen
 *   `extra.igViewCount`'ta saklanır. Yalnız videolar izlenme taşır (görsel/karusel: herkese açık izlenme yok).
 * - **`0 ≠ undefined`.** Yalnız aktörün verdiği sayı yazılır; verilmeyen alan hiç yazılmaz.
 * - **Gizli beğeni:** Instagram gizlenmiş beğeniyi `-1` döndürür → `likes` yazılmaz, `extra.likesHidden = true`.
 * - **Kapalı yorum:** `isCommentsDisabled` true ise sayı ölçülemez → `comments` yazılmaz, `extra.commentsDisabled = true`.
 * - Yorumcu/etiketlenen kimliği buradan HİÇ geçmez: yalnız sayılar ve bayraklar okunur.
 */
import { pickBool, pickCount, pickNumber, type RawItem } from "@/lib/platforms/_shared/field-pick";
import { isVideoFormat } from "@/lib/platforms/_shared/metric-fields";
import type { ContentFormat, NormalizedMetrics } from "@/lib/platforms/types";

export function extractMetrics(item: RawItem, format: ContentFormat): NormalizedMetrics {
  const metrics: NormalizedMetrics = { extra: {} };

  if (isVideoFormat(format)) {
    const play = pickCount(item, ["videoPlayCount"]);
    const view = pickCount(item, ["videoViewCount"]);
    if (play !== undefined) {
      metrics.views = play;
      metrics.viewsKind = "ig_play_count";
      if (view !== undefined) metrics.extra.igViewCount = view;
    } else if (view !== undefined) {
      metrics.views = view;
      metrics.viewsKind = "ig_view_count";
    }
  }

  const likes = pickNumber(item, ["likesCount"]);
  if (likes !== undefined && likes >= 0) metrics.likes = likes;
  else if (likes !== undefined) metrics.extra.likesHidden = true;

  if (pickBool(item, ["isCommentsDisabled", "commentsDisabled"]) === true) {
    metrics.extra.commentsDisabled = true;
  } else {
    const comments = pickCount(item, ["commentsCount"]);
    if (comments !== undefined) metrics.comments = comments;
  }

  return metrics;
}
