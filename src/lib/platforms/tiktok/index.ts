/**
 * TikTok platform modülü — herkese açık veri adaptörü (Apify `clockworks/tiktok-scraper`, oturumsuz).
 *
 * Bu platformda OLMAYANLAR (bilerek tanımsız; hatlar platform adına değil bu tanımsızlığa bakar):
 *  - `mediaDownload`: TikTok video adresi oturumsuz indirilemez → video incelemesi yok (adım `analysis_unsupported` ile atlanır).
 *  - `publishing` / `publisher`: resmi yayın API'si bağlı değil → yayın işi açılamaz.
 *  - İlgili hesaplar ve ortak yazar: TikTok verisinde yok (`relatedHandles` / `coauthors` yazılmaz).
 */
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { buildContentJob, buildProfileJob, buildSearchJob, TIKTOK_ACTORS } from "@/lib/platforms/tiktok/apify-jobs";
import { contentUrl, parseTikTokContentUrl, tiktokEmbedUrl } from "@/lib/platforms/tiktok/content-url";
import { normalizeHandle } from "@/lib/platforms/tiktok/handle";
import { parseSearch } from "@/lib/platforms/tiktok/normalize-search";
import { parseContent } from "@/lib/platforms/tiktok/normalize-content";
import { parseProfiles } from "@/lib/platforms/tiktok/normalize-profile";
import { tiktokViral } from "@/lib/platforms/tiktok/viral-jobs";
import type { PlatformModule, PublicDataAdapter } from "@/lib/platforms/types";

export const tiktokPublicData: PublicDataAdapter = {
  platform: "tiktok",
  // Sonuç başı fiyat kademeli: en yüksek kademe $0,0037 (Apify fiyat kaydı, 2026-10-13). Yedek = yaklaşık 2 katı.
  pricing: { actorIds: Object.values(TIKTOK_ACTORS), fallbackUnitPriceUsd: 0.0075 },
  normalizeHandle,
  contentUrl,
  buildProfileJob,
  buildContentJob,
  // Arama isteğe bağlıdır; `searchSection` değeri [NETLEŞMEDİ] (apify-jobs.ts), ilk gerçek koşuda doğrulanmalı.
  buildSearchJob,
  parseProfiles,
  parseContent,
  parseSearch,
  viral: tiktokViral,
};

export const tiktokModule: PlatformModule = {
  platform: "tiktok",
  label: PLATFORM_LABEL.tiktok,
  parseContentUrl: parseTikTokContentUrl,
  embedUrl: tiktokEmbedUrl,
  profileUrl: (handle) => `https://www.tiktok.com/@${handle}`,
  text: {
    contentNoun: "video",
    handlePlaceholder: "@kullaniciadi ya da tiktok.com/@kullaniciadi",
    contentUrlPlaceholder: "https://www.tiktok.com/@kullaniciadi/video/…",
    contentUrlHint: "tiktok.com/@kullaniciadi/video/… biçiminde tam video adresi; kısa paylaşım bağlantısı olmaz",
  },
  publicData: tiktokPublicData,
};
