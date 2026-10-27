/**
 * Video adresi kaynağı: hesabın en son BAŞARILI Apify reel koşularının dataset'i (`GET dataset items`, ücretsiz) → normalize →
 * içerik kimliğiyle eşleşen geçici `videoUrl` (platformun CDN'i, süreli). ÜCRETLİ Apify koşusu BAŞLATILMAZ: adresin süresi dolmuşsa
 * video analiz edilmez, `collect:now` (kullanıcı onayı ister) gerekir.
 * Saf kısım (eşleme, süre kontrolü) ayrı dışa açılır ve testlidir; ağ/DB kısmı `resolveVideoUrls`.
 */
import "server-only";

import { getDatasetItems } from "@/lib/apify/client";
import { getPlatformModule } from "@/lib/platforms/registry";
import type { NormalizedContent, Platform } from "@/lib/platforms/types";
import type { AdminClient } from "@/lib/supabase/admin";
import { readDownloadExpiry } from "@/lib/video-analysis/download-url";

/** Bir videonun adres aramasında gereken kimlikler (içerik + sahip). */
export interface VideoNeed {
  contentId: string;
  externalId: string;
  shortcode?: string;
  platform: Platform;
  ownerId: string;
  handle: string;
}

/** Dataset öğelerinden (normalize edilmiş) içerik kimliğine göre adres haritası: önce `externalId`, yoksa `shortcode` eşleşir. */
export function matchVideoUrls(needs: readonly VideoNeed[], items: readonly NormalizedContent[]): Map<string, string> {
  const byExternal = new Map<string, string>();
  const byShortcode = new Map<string, string>();
  for (const item of items) {
    if (item.ephemeralMediaUrl === undefined) continue;
    byExternal.set(item.externalId, item.ephemeralMediaUrl);
    if (item.shortcode) byShortcode.set(item.shortcode, item.ephemeralMediaUrl);
  }
  const found = new Map<string, string>();
  for (const need of needs) {
    const url = byExternal.get(need.externalId) ?? (need.shortcode ? byShortcode.get(need.shortcode) : undefined);
    if (url !== undefined) found.set(need.contentId, url);
  }
  return found;
}

/** Adresin bitişi (platform modülü okur; Instagram'da `oe`) geçmişte mi. Bitiş yoksa/okunamıyorsa süre bilinmez → dolmuş SAYILMAZ (indirme denemesi karar verir). */
export function isVideoUrlExpired(url: string, now: Date): boolean {
  try {
    const expiry = readDownloadExpiry(new URL(url));
    return expiry !== undefined && expiry.getTime() <= now.getTime();
  } catch {
    return false;
  }
}

export interface VideoUrlResolution {
  /** contentId → adres (süresi dolmuş olanlar DA burada: ayırmak çağıranın işi, `isVideoUrlExpired`). */
  urls: Map<string, string>;
  /** Hiçbir son koşunun dataset'inde bulunamayan içerikler. */
  missing: string[];
  /** Okunamayan dataset'ler (Türkçe kısa not; adres içermez). */
  notes: string[];
}

export type DatasetReader = (datasetId: string) => Promise<unknown[]>;

const RUNS_PER_OWNER = 3;

/**
 * Her sahip için en son başarılı içerik koşularını (en çok 3, yeniden eskiye) okur; adres bulunana kadar ilerler.
 * Dataset'i silinmiş/okunamayan koşu sessizce atlanmaz: `notes`'a yazılır.
 */
export async function resolveVideoUrls(
  client: AdminClient,
  workspaceId: string,
  needs: readonly VideoNeed[],
  readDataset: DatasetReader = (datasetId) => getDatasetItems(datasetId),
): Promise<VideoUrlResolution> {
  const urls = new Map<string, string>();
  const notes: string[] = [];
  const owners = new Map<string, VideoNeed[]>();
  for (const need of needs) owners.set(need.handle, [...(owners.get(need.handle) ?? []), need]);

  for (const [handle, ownerNeeds] of owners) {
    const { data, error } = await client
      .from("collection_runs")
      .select("id, dataset_id, started_at")
      .eq("workspace_id", workspaceId)
      .eq("provider", "apify")
      .eq("kind", "content")
      .eq("target_label", `@${handle}`)
      .in("status", ["succeeded", "ingested"])
      .not("dataset_id", "is", null)
      .order("started_at", { ascending: false })
      .limit(RUNS_PER_OWNER);
    if (error) throw new Error(`@${handle} için son koşular okunamadı: ${error.message}`);
    if ((data ?? []).length === 0) notes.push(`@${handle}: başarılı içerik koşusu yok.`);

    for (const run of data ?? []) {
      const remaining = ownerNeeds.filter((need) => !urls.has(need.contentId));
      if (remaining.length === 0) break;
      try {
        const platform = getPlatformModule(remaining[0].platform);
        const parsed = platform.publicData.parseContent(await readDataset(run.dataset_id as string));
        for (const [contentId, url] of matchVideoUrls(remaining, parsed.items)) urls.set(contentId, url);
      } catch (cause) {
        notes.push(`@${handle}: dataset okunamadı (${cause instanceof Error ? cause.message.slice(0, 120) : "bilinmeyen hata"}).`);
      }
    }
  }
  return { urls, missing: needs.filter((need) => !urls.has(need.contentId)).map((need) => need.contentId), notes };
}

export interface VideoPartition<T> {
  /** Adresi bulunan ve süresi dolmamış: analiz edilebilir. */
  ready: { item: T; url: string }[];
  /** Adresi bulundu ama `oe` süresi dolmuş: `failed: expired_url`. */
  expired: T[];
  /** Hiçbir son koşunun dataset'inde adres yok: `collect:now` gerekir. */
  missing: T[];
}

/** Seçilen videoları adres durumuna göre ayırır (saf). Sıra korunur. */
export function partitionVideos<T extends { id: string }>(items: readonly T[], urls: ReadonlyMap<string, string>, now: Date): VideoPartition<T> {
  const out: VideoPartition<T> = { ready: [], expired: [], missing: [] };
  for (const item of items) {
    const url = urls.get(item.id);
    if (url === undefined) out.missing.push(item);
    else if (isVideoUrlExpired(url, now)) out.expired.push(item);
    else out.ready.push({ item, url });
  }
  return out;
}

/** Hiçbir video analiz edilemiyorsa (hepsi dolmuş/eksik) koşu durur ve `collect:now` önerilir; ücretli koşu BAŞLATILMAZ. */
export function mustRecollect<T>(partition: VideoPartition<T>): boolean {
  return partition.ready.length === 0 && partition.expired.length + partition.missing.length > 0;
}
