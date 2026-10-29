/**
 * Yerel video kaynağı: stüdyoda üretilip Zernio ile yayınlanan KENDİ videonun dosyası diskte durur (`final.mp4`); video incelemesi bu
 * içerikler için Apify adresi yerine o dosyayı kullanır (kendi hesap artık Apify'la toplanmıyor, dataset'te adres yok).
 * Bağ: yayın işi (`publish_jobs`: yayınlanmış, `media_path` = `siparis:…`) → `published_permalink` → platform modülünün `parseContentUrl`'ü
 * → kısa kod → `content_items.shortcode`. Yedek: `published_external_id` içerik `external_id`'sine BİREBİR eşitse. Rakip içerik ASLA eşleşmez.
 * Dosya yolu yalnız `publish/order-media.ts` ile çözülür (kök dışı / eksik dosya reddedilir). Saf eşleme `matchLocalVideos`, DB kısmı `resolveLocalVideos`.
 */
import "server-only";

import { isOrderMediaPath } from "@/lib/order-media-path";
import { getPlatformModule, hasPlatformModule } from "@/lib/platforms/registry";
import type { Platform } from "@/lib/platforms/types";
import { OrderMediaError, ordersRootOf, resolveOrderMedia } from "@/lib/publish/order-media";
import { resolveOrderAccount } from "@/lib/studio-order/account-mode";
import type { AdminClient } from "@/lib/supabase/admin";

/** Eşleşecek içerik (yalnız gereken alanlar). */
export interface LocalContentRef {
  id: string;
  platform: Platform;
  shortcode?: string;
  externalId: string;
  isOwn: boolean;
}

/** Yayınlanmış, stüdyo videolu yayın işi (yeniden eskiye sıralı gelir). */
export interface PublishedOrderRow {
  platform: Platform;
  mediaPath: string;
  permalink?: string;
  externalId?: string;
}

export interface LocalVideoResolution {
  /** contentId → yerel dosyanın mutlak yolu (doğrulanmış, var olan). */
  files: Map<string, string>;
  /** Türkçe kısa notlar (dosya yolu içermez). */
  notes: string[];
}

/** Bağlantıdan kısa kod; ayrıştırılamazsa undefined. */
function shortcodeOfPermalink(platform: Platform, permalink: string | undefined): string | undefined {
  if (permalink === undefined || !hasPlatformModule(platform)) return undefined;
  const parsed = getPlatformModule(platform).parseContentUrl(permalink);
  return parsed !== undefined && parsed.platform === platform ? parsed.shortcode : undefined;
}

/**
 * Yayın işlerini kendi içeriklere eşler (SAF; dosya erişimi `resolveFile` ile enjekte edilir: yoksa `undefined` döner, geçersizse fırlatır).
 * İçerik başına ilk çözülebilen iş kazanır. `siparis:` önekli olmayan iş atlanır.
 */
export function matchLocalVideos(contents: readonly LocalContentRef[], rows: readonly PublishedOrderRow[], resolveFile: (mediaPath: string) => string | undefined): LocalVideoResolution {
  const own = contents.filter((c) => c.isOwn);
  const files = new Map<string, string>();
  const notes: string[] = [];
  for (const row of rows) {
    if (!isOrderMediaPath(row.mediaPath)) continue;
    const code = shortcodeOfPermalink(row.platform, row.permalink);
    const target = own.find(
      (c) => c.platform === row.platform && !files.has(c.id) && ((code !== undefined && c.shortcode === code) || (row.externalId !== undefined && c.externalId === row.externalId)),
    );
    if (target === undefined) continue;
    try {
      const file = resolveFile(row.mediaPath);
      if (file === undefined) notes.push("Yayınlanmış bir stüdyo videosunun dosyası bulunamadı; Apify yoluna düşülecek.");
      else files.set(target.id, file);
    } catch (error) {
      notes.push(`Stüdyo videosu kullanılamadı (${error instanceof OrderMediaError ? error.message : "beklenmeyen hata"}); Apify yoluna düşülecek.`);
    }
  }
  return { files, notes };
}

export interface LocalVideoOptions {
  workspaceSlug?: string;
  handle?: string;
  env?: Readonly<Record<string, string | undefined>>;
  resolveFile?: (root: string, mediaPath: string, studioSlug: string) => string;
}

/** Çalışma alanının yayınlanmış stüdyo videolarını okur ve kendi içeriklere eşler. Okuma hatasında fırlatmaz: boş + not. */
export async function resolveLocalVideos(client: AdminClient, workspaceId: string, contents: readonly LocalContentRef[], options: LocalVideoOptions = {}): Promise<LocalVideoResolution> {
  if (!contents.some((c) => c.isOwn)) return { files: new Map(), notes: [] };
  const account = resolveOrderAccount({ panelSlug: options.workspaceSlug, handle: options.handle, hasScript: false });
  if (account === undefined) return { files: new Map(), notes: [] };
  const { data, error } = await client
    .from("publish_jobs")
    .select("platform, media_path, published_permalink, published_external_id")
    .eq("workspace_id", workspaceId)
    .eq("status", "published")
    .like("media_path", "siparis:%")
    .order("published_at", { ascending: false });
  if (error) return { files: new Map(), notes: [`Yayın işleri okunamadı (${error.message.slice(0, 120)}); yerel video kullanılmadı.`] };
  const rows: PublishedOrderRow[] = (data ?? []).flatMap((r) =>
    r.media_path === null ? [] : [{ platform: r.platform as Platform, mediaPath: r.media_path, permalink: r.published_permalink ?? undefined, externalId: r.published_external_id ?? undefined }],
  );
  const root = ordersRootOf(options.env);
  const resolve = options.resolveFile ?? resolveOrderMedia;
  return matchLocalVideos(contents, rows, (mediaPath) => {
    try {
      return resolve(root, mediaPath, account.slug);
    } catch (error) {
      if (error instanceof OrderMediaError && error.code === "missing") return undefined;
      throw error;
    }
  });
}
