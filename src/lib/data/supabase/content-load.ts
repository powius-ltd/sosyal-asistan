/**
 * İçerik satırlarını `ContentItem`'a tamamlar: sahip bilgisi (kendi hesap / rakip) ve içerik başına EN SON metrik
 * (`content_latest_metrics`, `content_item_id = any(<≤50 kimlik>)`; tüm listeyle join YOK). Her sorgu açıkça
 * `workspace_id` süzgeçlidir. Liste sorguları (`content-queries`, `outlier-query`, `overview-query`, `competitors`)
 * satırı okur, bu dosya tamamlar: içerik başına ek okuma (N+1) yok, sayfa başına sabit sayıda istek var.
 */
import type { ContentItem, ContentOwner } from "@/lib/domain/content";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { unwrap } from "@/lib/data/supabase/errors";
import { inChunks } from "@/lib/data/supabase/paging";
import {
  LATEST_COLUMNS,
  ownerKey,
  ownerKeyOf,
  toContentItem,
  type ContentColumnRow,
  type ContentRow,
  type LatestRow,
} from "@/lib/data/supabase/mappers/content";
import { opt } from "@/lib/data/supabase/mappers/common";

type OwnerRef = Pick<ContentColumnRow, "social_account_id" | "competitor_id">;

function unique<T>(values: (T | null)[]): T[] {
  return [...new Set(values.filter((v): v is T => v !== null))];
}

/** Satırların sahiplerini (kendi hesap + rakip) okur; anahtar `ownerKey(kind, id)`. */
export async function loadOwners(ctx: SupabaseContext, wsId: string, rows: readonly OwnerRef[]): Promise<Map<string, ContentOwner>> {
  const ownIds = unique(rows.map((r) => r.social_account_id));
  const competitorIds = unique(rows.map((r) => r.competitor_id));
  const [own, competitors] = await Promise.all([
    inChunks(ownIds, async (part) =>
      unwrap(await ctx.db.from("social_accounts").select("id, handle, display_name, followers").eq("workspace_id", wsId).in("id", part)),
    ),
    inChunks(competitorIds, async (part) =>
      unwrap(await ctx.db.from("competitors").select("id, handle, display_name, followers").eq("workspace_id", wsId).in("id", part)),
    ),
  ]);
  const owners = new Map<string, ContentOwner>();
  for (const a of own) owners.set(ownerKey("own", a.id), { kind: "own", id: a.id, handle: a.handle, displayName: opt(a.display_name), followers: opt(a.followers) });
  for (const c of competitors) {
    owners.set(ownerKey("competitor", c.id), { kind: "competitor", id: c.id, handle: c.handle, displayName: opt(c.display_name), followers: opt(c.followers) });
  }
  return owners;
}

/** İçerik başına son ölçüm (`captured_at` NULL = hiç ölçülmedi). Sonuç `content_item_id` ile anahtarlı. */
export async function loadLatestMetrics(ctx: SupabaseContext, wsId: string, contentIds: readonly string[]): Promise<Map<string, LatestRow>> {
  const rows = await inChunks(contentIds, async (part) =>
    unwrap(await ctx.db.from("content_latest_metrics").select(LATEST_COLUMNS).eq("workspace_id", wsId).in("content_item_id", part)),
  );
  const byContent = new Map<string, LatestRow>();
  for (const row of rows) if (row.content_item_id !== null) byContent.set(row.content_item_id, row);
  return byContent;
}

/** Sahibi dizinde bulunamayan içerik (yarış: hesap az önce silindi) için yer tutucu; cascade FK bunu normalde engeller. */
function orphanOwner(row: OwnerRef): ContentOwner {
  return row.social_account_id !== null
    ? { kind: "own", id: row.social_account_id, handle: "bilinmiyor" }
    : { kind: "competitor", id: row.competitor_id as string, handle: "bilinmiyor" };
}

/**
 * Satırları sahip + son metriklerle `ContentItem`'a çevirir (girdi sırası korunur). `metrics: false` yalnız özet
 * gereken yerlerde (fikir kanıtı, koleksiyon öğesi) metrik okumasını atlar; `metrics` boş kalır.
 */
export async function hydrateContent(
  ctx: SupabaseContext,
  wsId: string,
  rows: readonly ContentRow[],
  options: { metrics?: boolean } = {},
): Promise<ContentItem[]> {
  if (rows.length === 0) return [];
  const [owners, latest] = await Promise.all([
    loadOwners(ctx, wsId, rows),
    options.metrics === false ? Promise.resolve(new Map<string, LatestRow>()) : loadLatestMetrics(ctx, wsId, rows.map((r) => r.id)),
  ]);
  return rows.map((row) => toContentItem(row, owners.get(ownerKeyOf(row)) ?? orphanOwner(row), latest.get(row.id)));
}
