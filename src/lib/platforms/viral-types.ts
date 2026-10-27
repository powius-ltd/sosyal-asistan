/**
 * Viral av sözleşmesi (platform bağımsız): konuyla patlamış video havuzu. `PublicDataAdapter.viral` (isteğe bağlı) bu arayüzü taşır;
 * tanımsız = o platformda viral av YOK (açık durum; başka platformun kuralı yedek olarak uygulanmaz).
 *
 * Şasi: bir viral video rakip içeriği DEĞİLDİR (`content_items`'a girmez). Yalnız aşağıdaki alanlar okunur; yorumcu, etiketlenen / anılan kişi,
 * yazarın adı / fotoğrafı / biyografisi ve video / kapak adresleri HİÇ okunmaz (platform `privacy.test.ts` dosyaları zorlar).
 */
import type { ParseResult, Platform, ScrapeJobSpec, ViewsKind } from "@/lib/platforms/types";

export interface ViralVideo {
  platform: Platform;
  /** Platformdaki içerik kimliği (IG kısa kodu / TikTok video kimliği). */
  externalId: string;
  url: string;
  /** Yazarın herkese açık kullanıcı adı (küçük harf). */
  authorHandle: string;
  /** Sonuçta yoksa hiç yazılmaz (`undefined ≠ 0`); oran ancak bununla hesaplanır. */
  authorFollowers?: number;
  views: number;
  viewsKind: ViewsKind;
  likes?: number;
  comments?: number;
  shares?: number;
  publishedAt: string;
  durationSec?: number;
  /** En çok 500 karakter. */
  caption?: string;
  hashtags: string[];
}

export interface ViralAdapter {
  /** Konu başına iş (`limit` = o sorgudan istenen en çok sonuç). Ücretli ekler açıkça kapalıdır. */
  buildJob(o: { query: string; limit: number }): ScrapeJobSpec;
  parse(raw: unknown[]): ParseResult<ViralVideo>;
  /**
   * Yazar takipçisi av sonucunda geliyor mu (TikTok: evet). Hayırsa (Instagram) eşik adayı yazarlar için ayrıca profil işi
   * (`PublicDataAdapter.buildProfileJob` / `parseProfiles`) çalıştırılır.
   */
  followersInResult: boolean;
}
