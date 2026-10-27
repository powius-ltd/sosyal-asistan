/**
 * Viral havuz kaydı (`viral_items`, 0027; yalnız sunucu, service role). Aynı içerik (çalışma alanı + platform + kimlik) ikinci kez YAZILMAZ:
 * var olan satırın sayıları (izlenme, beğeni, yorum, paylaşım, takipçi, oran) tazelenir; ilk bulan sorgu ve `found_at` korunur.
 * Yalnız izin listesindeki alanlar yazılır (video, kapak, yorum, kişi verisi tabloda YOKTUR).
 */
import "server-only";

import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { ViralItem } from "@/lib/viral/select";

type ViralRow = Database["public"]["Tables"]["viral_items"]["Insert"];

export interface ViralWriteResult {
  inserted: number;
  refreshed: number;
}

export function toViralRow(workspaceId: string, item: ViralItem, now: Date): ViralRow {
  return {
    workspace_id: workspaceId,
    platform: item.platform,
    external_id: item.externalId,
    author_handle: item.authorHandle,
    author_followers: item.authorFollowers,
    views: item.views,
    views_kind: item.viewsKind,
    likes: item.likes ?? null,
    comments: item.comments ?? null,
    shares: item.shares ?? null,
    views_per_follower: item.viewsPerFollower,
    published_at: item.publishedAt,
    duration_sec: item.durationSec ?? null,
    caption: item.caption ?? null,
    hashtags: item.hashtags,
    content_url: item.url,
    query: item.query,
    found_at: now.toISOString(),
    refreshed_at: now.toISOString(),
  };
}

const fail = (what: string, message: string): never => {
  throw new Error(`Viral havuz: ${what} (${message}).`);
};

/** Satırları yazar: yeni olanlar eklenir, var olanların sayıları tazelenir. */
export async function saveViralItems(client: AdminClient, workspaceId: string, items: readonly ViralItem[], now: Date): Promise<ViralWriteResult> {
  if (items.length === 0) return { inserted: 0, refreshed: 0 };
  const ids = [...new Set(items.map((item) => item.externalId))];
  const existing = await client.from("viral_items").select("platform, external_id, query, found_at").eq("workspace_id", workspaceId).in("external_id", ids);
  if (existing.error) fail("mevcut satırlar okunamadı", existing.error.message);
  const known = new Map((existing.data ?? []).map((row) => [`${row.platform}:${row.external_id}`, row]));

  let refreshed = 0;
  const rows = items.map((item) => {
    const row = toViralRow(workspaceId, item, now);
    const old = known.get(`${item.platform}:${item.externalId}`);
    if (old === undefined) return row;
    refreshed += 1;
    return { ...row, query: old.query, found_at: old.found_at };
  });
  const { error } = await client.from("viral_items").upsert(rows, { onConflict: "workspace_id,platform,external_id" });
  if (error) fail("satırlar yazılamadı", error.message);
  return { inserted: rows.length - refreshed, refreshed };
}
