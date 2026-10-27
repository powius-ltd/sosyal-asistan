/**
 * Instagram platform modülü — herkese açık veri adaptörü (Apify, oturumsuz).
 * Kendi hesap (`owned`, resmi Instagram Login API) ve yayın (`publisher`) Faz 3'te eklenir.
 */
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { buildContentJob, buildProfileJob, buildSearchJob, INSTAGRAM_ACTORS } from "@/lib/platforms/instagram/apify-jobs";
import { contentUrl } from "@/lib/platforms/instagram/content-url";
import { instagramEmbedUrl } from "@/lib/platforms/instagram/embed";
import { normalizeHandle } from "@/lib/platforms/instagram/handle";
import { instagramMediaDownload } from "@/lib/platforms/instagram/media-download";
import { parseContent } from "@/lib/platforms/instagram/normalize-content";
import { parseProfiles } from "@/lib/platforms/instagram/normalize-profile";
import { INSTAGRAM_VIRAL_ACTOR, instagramViral } from "@/lib/platforms/instagram/viral-jobs";
import { parseSearch } from "@/lib/platforms/instagram/normalize-search";
import { parseInstagramContentUrl } from "@/lib/platforms/instagram/shortcode";
import type { PlatformModule, PublicDataAdapter } from "@/lib/platforms/types";

export const instagramPublicData: PublicDataAdapter = {
  platform: "instagram",
  // Bilinen sonuç başı fiyatın (~$0,0023–0,0027) yaklaşık 2 katı.
  pricing: { actorIds: [...Object.values(INSTAGRAM_ACTORS), INSTAGRAM_VIRAL_ACTOR], fallbackUnitPriceUsd: 0.005 },
  normalizeHandle,
  contentUrl,
  buildProfileJob,
  buildContentJob,
  buildSearchJob,
  parseProfiles,
  parseContent,
  parseSearch,
  viral: instagramViral,
};

export const instagramModule: PlatformModule = {
  platform: "instagram",
  label: PLATFORM_LABEL.instagram,
  parseContentUrl: parseInstagramContentUrl,
  embedUrl: instagramEmbedUrl,
  profileUrl: (handle) => `https://www.instagram.com/${handle}/`,
  text: {
    contentNoun: "Reels",
    handlePlaceholder: "@kullaniciadi ya da instagram.com/kullaniciadi",
    contentUrlPlaceholder: "https://www.instagram.com/reel/…",
    contentUrlHint: "Reels ya da gönderi adresi",
  },
  mediaDownload: instagramMediaDownload,
  // Instagram Content Publishing API: açıklama ≤ 2200 kod noktası, ≤ 30 etiket, 24 saatte 100 API yayını (Instagram Login).
  publishing: { captionMax: 2200, hashtagMax: 30, dailyLimit: 100 },
  publicData: instagramPublicData,
};
