/**
 * Hesaplar: rakipler (herkese açık, Apify) ve kendi hesaplar (OAuth ya da yalnız kazıma).
 * Tablolar: `competitors`, `social_accounts` (PLAN.md "Veri modeli").
 * Token'lar (`social_account_tokens`) UI'a HİÇ çıkmaz — bu tiplerde token alanı yok.
 */
import type { Platform } from "@/lib/platforms/types";

// ------------------------------------------------------------------- Rakip

/**
 * candidate: keşfedildi, henüz takipte değil · tracked: takipte · ignored: kullanıcı yoksaydı ·
 * private: hesap gizli (veri alınamaz) · not_found: hesap bulunamadı/silinmiş.
 */
export type CompetitorStatus = "candidate" | "tracked" | "ignored" | "private" | "not_found";

/** manual: elle eklendi · related: ilgili hesaplardan · search: aramadan. */
export type CompetitorSource = "manual" | "related" | "search";

/**
 * Rakip kullanıcı adı biçimi (normalize edilmiş: küçük harf, rakam, nokta, alt çizgi, tire; 1–50 karakter).
 * TEK tanım: UI ayrıştırıcısı (`components/competitors/handle.ts`) ve tüm depo uygulamaları (mock, Supabase) bunu kullanır.
 */
export const HANDLE_PATTERN = /^[a-z0-9._-]{1,50}$/;

export const COMPETITOR_STATUSES: readonly CompetitorStatus[] = [
  "candidate",
  "tracked",
  "ignored",
  "private",
  "not_found",
];

export interface Competitor {
  id: string;
  workspaceId: string;
  platform: Platform;
  /** Normalize edilmiş (küçük harf, "@" yok). */
  handle: string;
  externalId?: string;
  displayName?: string;
  bio?: string;
  followers?: number;
  following?: number;
  postsCount?: number;
  isVerified?: boolean;
  category?: string;
  avatarUrl?: string;
  status: CompetitorStatus;
  /**
   * Toplama bu rakibi neden `private`/`not_found` yaptı (kısa Türkçe sebep, ör. "hesap gizli"); kullanıcı rakibi izlemeye/
   * adaylığa döndürünce silinir. Yalnız erişim hatasında dolu, aksi halde undefined.
   */
  statusReason?: string;
  source: CompetitorSource;
  /** source=related/search ise bu adayı hangi hesap/sorgu getirdi. */
  discoveredVia?: string;
  /** Profil verisinde ölçülemeyen alanlar (ör. ["followers"]). */
  missingFields: string[];
  contentCount: number;
  addedAt: string;
  /** Son başarılı toplama. undefined = hiç toplanmadı. */
  lastCollectedAt?: string;

  // ---- Özet istatistikler (depo hesaplar; ekran içerik listesini tarayıp kendisi türetmez).
  // Hepsi ölçülemezse undefined'dır, 0 DEĞİL: içerik hiç toplanmadıysa ya da veri yetmiyorsa "—" görünür.

  /**
   * Son 7 günde takipçi değişimi: en son takipçi ölçümü − ondan en az 6 gün önceki en yeni ölçüm
   * (negatif = kayıp). İki ölçüm yoksa undefined. Kaynak: `account_snapshots`.
   */
  followersDelta7d?: number;
  /**
   * Kısa videoların medyan izlenmesi, YALNIZ rakibin en sık görülen `viewsKind`'ı içinde (`ig_play_count` ↔
   * `ig_view_count` karışmaz; karusel/görselin herkese açık izlenmesi yoktur, hesaba girmez). Eşit sayıda
   * türde adı alfabetik önce gelen seçilir. İzlenmesi ölçülmüş kısa video yoksa undefined (0 değil).
   * Betimleyici özet; lift için içeriğin kendi baz çizgisi kullanılır.
   */
  medianViews?: number;
  /**
   * Lift kademesi ≥ 3 (`OUTLIER_MIN_TIER`) olan toplanmış içerik sayısı. Hiçbir içeriğin skoru
   * hesaplanamadıysa (baz çizgisi yok) undefined — "0 tutan" ile "ölçülemedi" karışmaz.
   */
  outlierCount?: number;
  /**
   * Toplanan içeriğin yayın aralığından haftalık paylaşım sıklığı (`computeCadence`). Tarihli içerik
   * 3'ten azsa undefined.
   */
  postsPerWeek?: number;
}

/** Keşfet ekranındaki aday satırı (`status = candidate` olan rakipin görünümü). */
export interface DiscoveryCandidateView {
  /** competitors.id — izle/yoksay için `setCompetitorStatus` buna uygulanır. */
  competitorId: string;
  platform: Platform;
  handle: string;
  displayName?: string;
  followers?: number;
  source: Exclude<CompetitorSource, "manual">;
  via?: string;
  /** Takipçi sayısı kendi hesapların ±3x aralığında mı (benzer boy filtresi). undefined = ölçülemedi. */
  similarSize?: boolean;
  discoveredAt: string;
}

// ------------------------------------------------------------- Kendi hesap

/**
 * scrape_only: yalnız herkese açık kazıma (OAuth yok) · connected: resmi API bağlı ·
 * expired: token süresi doldu, yeniden bağlanmalı · revoked: kullanıcı erişimi geri aldı.
 */
export type OwnAccountConnection = "scrape_only" | "connected" | "expired" | "revoked";

export interface OwnAccount {
  id: string;
  workspaceId: string;
  platform: Platform;
  handle: string;
  displayName?: string;
  followers?: number;
  avatarUrl?: string;
  connection: OwnAccountConnection;
  /** İzinler (ör. instagram_business_basic). connection=connected dışında boş olabilir. */
  scopes: string[];
  tokenExpiresAt?: string;
  lastSyncedAt?: string;
  createdAt: string;
}

// ------------------------------------------------------ Platform kuralı

/**
 * KURAL: bir hesap tek platforma aittir ve rakipleri AYNI platformdan olur (baz çizgisi, karşılaştırma ve plan platformlar arası
 * karıştırılmaz). `ownPlatforms` çalışma alanının kendi hesaplarının platformlarıdır. Sorun yoksa undefined, varsa kullanıcıya
 * gösterilebilir Türkçe mesaj. Depo uygulamaları (`addCompetitor`, `startOnboardingBuild`) ve keşif hattı (aday yazımı) AYNI fonksiyonu
 * kullanır; platform adıyla dallanılmaz.
 */
export function rivalPlatformProblem(ownPlatforms: readonly Platform[], rivalPlatform: Platform): string | undefined {
  if (ownPlatforms.length === 0) return "Önce kendi hesabını ekle: rakipler kendi hesabınla aynı platformdan seçilir.";
  return ownPlatforms.includes(rivalPlatform) ? undefined : "Rakip, kendi hesabınla aynı platformdan olmalı.";
}
