/**
 * Platform sözleşmesi — TÜM platform modülleri (instagram/tiktok/youtube) bu
 * arayüzleri uygular. Bu dosya yalnız sıralı ajanlar tarafından değiştirilir
 * (bkz. AGENTS.md "Dosya sahipliği"). Paralel ajan değişiklik isterse raporuna yazar.
 *
 * Uyum: hiçbir arayüz oturum/çerez/şifre almaz. Kendi hesap yalnız resmi API
 * (OAuth token'ı `TokenSet`), rakip verisi yalnız herkese açık + oturumsuz (Apify).
 */
import type { ViralAdapter } from "@/lib/platforms/viral-types";

export type Platform = "instagram" | "tiktok" | "youtube";
export type ContentFormat = "short_video" | "long_video" | "image" | "carousel" | "story";

/**
 * "views" alanının ne anlama geldiği platforma ve API'ye göre değişir; farklı
 * `ViewsKind`'lar birbirine KARIŞTIRILMAZ (baz çizgisi/lift aynı viewsKind içinde hesaplanır).
 */
export type ViewsKind = "ig_play_count" | "ig_view_count" | "ig_views" | "tt_play_count" | "yt_views";

/** Ölçülemeyen alan hiç yazılmaz (undefined). 0 = "ölçtük, sıfır". */
export interface NormalizedMetrics {
  views?: number;
  viewsKind?: ViewsKind;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
  avgWatchSec?: number;
  extra: Record<string, number | string | boolean>;
}

export interface NormalizedContent {
  platform: Platform;
  externalId: string;
  shortcode?: string;
  url?: string;
  ownerHandle?: string;
  format: ContentFormat;
  publishedAt?: string;
  caption?: string;
  hashtags: string[];
  durationSec?: number;
  isPinned?: true;
  isPaidPartnership?: boolean;
  /**
   * Ortak yazarların HERKESE AÇIK kullanıcı adları (küçük harf, tekrarsız, içeriğin sahibi hariç; keşif ağı için — kullanıcı
   * kararı, 2026-09-30). Yalnız kullanıcı adı: ad/kimlik/fotoğraf alanları okunmaz. Yorumcu ve etiketlenen kimlikleri YOK.
   * Ortak yazar yoksa alan hiç yazılmaz.
   */
  coauthors?: string[];
  transcript?: string;
  ephemeralMediaUrl?: string; // ephemeral: DB'ye YAZILMAZ
  metrics: NormalizedMetrics;
  missingFields: string[];
}

export interface NormalizedProfile {
  platform: Platform;
  handle: string;
  externalId?: string;
  displayName?: string;
  bio?: string;
  followers?: number;
  following?: number;
  postsCount?: number;
  isPrivate?: boolean;
  isVerified?: boolean;
  /** İşletme hesabı mı (profilde herkese açık işaret); bilinmiyorsa hiç yazılmaz. */
  isBusinessAccount?: boolean;
  category?: string;
  avatarUrl?: string;
  /** Profildeki dış bağlantı (biyografi bağlantısı; yalnız http/https). Huni analizinde (Faz 3.5) kullanılır. */
  externalUrl?: string;
  relatedHandles?: string[];
  missingFields: string[];
}

export interface DiscoveryCandidate {
  platform: Platform;
  handle: string;
  followers?: number;
  source: "related" | "search";
  via?: string;
}

export interface ParseResult<T> {
  items: T[];
  notItems: { reason: string }[];
  accessError?: "private" | "not_found" | string;
}

export type CollectionKind = "profile" | "content" | "discovery_related" | "discovery_search";

export interface ScrapeJobSpec {
  kind: CollectionKind;
  actorId: string;
  input: Record<string, unknown>;
  expectedResults: number;
}

/**
 * Aktör fiyatı okunamadığında kullanılacak MUHAFAZAKÂR sonuç başı fiyat (USD) ve bunun geçerli olduğu aktörler. Platformun
 * aktörleri farklı fiyatlıdır: yedek fiyat platformun bilinen en yüksek kademesinin üstünde tutulur (fazla ayırmak eksik ayırmaktan güvenlidir).
 */
export interface ActorPricingFallback {
  actorIds: readonly string[];
  fallbackUnitPriceUsd: number;
}

/** Rakip + pazar verisi: herkese açık, oturumsuz, Apify üzerinden. */
export interface PublicDataAdapter {
  platform: Platform;
  /** Fiyatı okunamayan aktör için yedek birim fiyat (`lib/apify/pricing.ts` okur). */
  pricing: ActorPricingFallback;
  normalizeHandle(raw: string): string;
  contentUrl(c: Pick<NormalizedContent, "externalId" | "shortcode">): string;
  buildProfileJob(handles: string[]): ScrapeJobSpec;
  buildContentJob(o: { handle: string; limit: number; newerThan?: string; includeTranscript: boolean }): ScrapeJobSpec;
  buildSearchJob?(o: { query: string; limit: number }): ScrapeJobSpec;
  parseProfiles(raw: unknown[]): ParseResult<NormalizedProfile>;
  parseContent(raw: unknown[]): ParseResult<NormalizedContent>;
  parseSearch?(raw: unknown[]): ParseResult<DiscoveryCandidate>;
  /** Viral av (konuyla patlamış video havuzu; `lib/viral`). Tanımsız = o platformda viral av YOK. */
  viral?: ViralAdapter;
}

export interface TokenSet {
  accessToken: string;
  expiresAt: string;
  userId: string;
  scopes: string[];
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

/** Kendi hesap: yalnız resmi API (OAuth). Faz 3. */
export interface OwnedAccountAdapter {
  platform: Platform;
  authorizeUrl(o: { state: string; redirectUri: string }): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  refresh(t: TokenSet): Promise<TokenSet>;
  fetchProfile(t: TokenSet): Promise<NormalizedProfile>;
  listContent(t: TokenSet, o: { since?: string; cursor?: string }): Promise<Page<NormalizedContent>>;
  fetchContentInsights(t: TokenSet, ids: string[]): Promise<Record<string, NormalizedMetrics>>;
  fetchAccountInsights(t: TokenSet, o: { since: string; until: string }): Promise<Record<string, number>>;
}

export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";

export interface PublishPayload {
  videoUrl: string;
  caption?: string;
  coverUrl?: string;
  shareToFeed: boolean;
}

/** Yayın: yalnız resmi Content Publishing API; her yayın insan onaylı. Faz 3. */
export interface PublisherAdapter {
  platform: Platform;
  getQuota(t: TokenSet): Promise<{ used: number; limit: number; windowHours: number }>;
  createContainer(t: TokenSet, p: PublishPayload): Promise<{ containerId: string; expiresAt: string }>;
  containerStatus(t: TokenSet, containerId: string): Promise<{ status: ContainerStatus; error?: string }>;
  publish(t: TokenSet, containerId: string): Promise<{ externalId: string; permalink?: string }>;
}

/** Bir içerik bağlantısından (URL) çıkan kimlik (`PlatformModule.parseContentUrl`). */
export interface ParsedContentUrl {
  platform: Platform;
  /** Platformdaki kısa kod (büyük/küçük harf duyarlı); `content_items.shortcode` ile eşleşir. */
  shortcode: string;
  /** reel: Reels bağlantısı · post: gönderi bağlantısı (`/p/`; her medya türü için geçerlidir) · video: platformun tek video bağlantısı. */
  kind: "reel" | "post" | "video";
}

/**
 * Video incelemesi için GEÇİCİ indirme kuralı. Yalnız oturumsuz, çerezsiz, özel başlıksız indirilebilen CDN alan adları
 * (tam sonek eşleşmesi) yazılır; indirilen dosya analiz biter bitmez silinir. Platform bunu tanımlamıyorsa o platformda video
 * incelemesi YOKTUR (inceleme adımı açık sonuç koduyla atlanır; hat sayılar + açıklama ile sürer).
 */
export interface MediaDownloadPolicy {
  allowedDomains: readonly string[];
  /** Süreli (imzalı) adresin bitiş zamanı; adres bitiş taşımıyor ya da okunamıyorsa undefined (bilinmiyor ≠ geçmiş). */
  readExpiry(url: URL): Date | undefined;
}

/** Müşteri metninde platforma göre değişen adlar ve örnekler (tek yer; ekran platform adıyla dallanmaz). */
export interface PlatformText {
  /** İçerik türünün adı: "Reels", "video" … (cümle içinde, tekil). */
  contentNoun: string;
  /** Kullanıcı adı alanı örneği ("@kullaniciadi ya da …/kullaniciadi"). */
  handlePlaceholder: string;
  /** İçerik bağlantısı alanı örneği. */
  contentUrlPlaceholder: string;
  /** Geçersiz içerik bağlantısında ne beklendiği ("Reels ya da gönderi adresi"). */
  contentUrlHint: string;
}

/** Resmi yayın API'sinin açıklama / kota kuralları. Tanımlı değilse o platformda yayın YOKTUR. */
export interface PublishingRules {
  captionMax: number;
  hashtagMax: number;
  /** 24 saatlik hareketli pencerede API yayını üst sınırı. */
  dailyLimit: number;
}

export interface PlatformModule {
  platform: Platform;
  label: string;
  /**
   * Kullanıcının yapıştırdığı içerik bağlantısını (URL) kısa koda çevirir (fikir ↔ yayınlanan Reels bağı). Tanınmayan, başka
   * platforma/alan adına ait ya da güvenli olmayan (http/https dışı, kimlik bilgili) adres → undefined. UI platforma dallanmaz:
   * depo girdi doğrulaması (`lib/data/idea-link-input.ts`) bunu çağırır.
   */
  parseContentUrl(url: string): ParsedContentUrl | undefined;
  /**
   * İçeriğin herkese açık kalıcı bağlantısından platformun RESMİ gömme (embed) adresi; türetilemiyorsa undefined (oynatıcı çizilmez).
   * Süreli CDN adresi asla gömülmez. Ortak bileşen: `components/video/content-embed.tsx`.
   */
  embedUrl(permalink: string | undefined | null): string | undefined;
  /** Kullanıcı adından herkese açık profil bağlantısı. */
  profileUrl(handle: string): string;
  text: PlatformText;
  /** Video incelemesi için geçici indirme; yoksa bu platformda video incelemesi yok. */
  mediaDownload?: MediaDownloadPolicy;
  /** Resmi yayın kuralları; yoksa bu platformda yayın yok. */
  publishing?: PublishingRules;
  publicData: PublicDataAdapter;
  owned?: OwnedAccountAdapter;
  publisher?: PublisherAdapter;
}
