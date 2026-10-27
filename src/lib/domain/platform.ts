/**
 * Platform, format ve views türü — alan tipleri `lib/platforms/types.ts`'ten
 * re-export edilir (tek kaynak), UI için Türkçe etiketler burada.
 */
import type { ContentFormat, Platform, ViewsKind } from "@/lib/platforms/types";

export type { ContentFormat, NormalizedMetrics, Platform, ViewsKind } from "@/lib/platforms/types";

export const PLATFORMS: readonly Platform[] = ["instagram", "tiktok", "youtube"];

export const CONTENT_FORMATS: readonly ContentFormat[] = [
  "short_video",
  "long_video",
  "image",
  "carousel",
  "story",
];

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export const FORMAT_LABEL: Record<ContentFormat, string> = {
  short_video: "Kısa video",
  long_video: "Uzun video",
  image: "Görsel",
  carousel: "Karusel",
  story: "Hikaye",
};

/** `views` sayısının platformdaki karşılığı — kullanıcıya tooltip/dipnot olarak gösterilir. */
export const VIEWS_KIND_LABEL: Record<ViewsKind, string> = {
  ig_play_count: "Instagram oynatma sayısı",
  ig_view_count: "Instagram görüntüleme sayısı",
  ig_views: "Instagram görüntüleme (resmi API)",
  tt_play_count: "TikTok oynatma sayısı",
  yt_views: "YouTube izlenme",
};
