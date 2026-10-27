/**
 * `measure:zernio` veri erişimi (service role; her sorgu `workspace_id` süzgeçli). Mantık `measure-zernio.ts`'tedir;
 * testler bu arayüzün bellek içi sürümünü kullanır.
 */
import "server-only";

import { fetchAllRows, inChunks } from "@/lib/data/supabase/paging";
import { unwrap } from "@/lib/data/supabase/errors";
import { toCount } from "@/lib/collection/content-rows";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { ZernioContentFields } from "@/lib/zernio/map";

export type ZernioSnapshotRow = Database["public"]["Tables"]["metric_snapshots"]["Insert"] & {
  workspace_id: string;
  content_item_id: string;
  captured_at: string;
};

export interface ZernioStoredSnapshot {
  id: string;
  content_item_id: string;
  captured_at: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  avg_watch_sec: number | null;
  owner_followers: number | null;
}

export interface ZernioStore {
  listInstagramAccounts(workspaceId: string): Promise<{ id: string; handle: string }[]>;
  /** `external_id` → içerik kimliği (yalnız bu çalışma alanının Instagram içeriği). */
  findContentByExternalIds(workspaceId: string, externalIds: readonly string[]): Promise<Map<string, string>>;
  insertContent(workspaceId: string, socialAccountId: string, fields: ZernioContentFields): Promise<string>;
  listZernioSnapshotsSince(workspaceId: string, contentIds: readonly string[], sinceIso: string): Promise<ZernioStoredSnapshot[]>;
  insertSnapshot(row: ZernioSnapshotRow): Promise<void>;
  updateSnapshot(id: string, row: ZernioSnapshotRow): Promise<void>;
}

export function createSupabaseZernioStore(db: AdminClient): ZernioStore {
  return {
    async listInstagramAccounts(workspaceId) {
      return unwrap(await db.from("social_accounts").select("id, handle").eq("workspace_id", workspaceId).eq("platform", "instagram"));
    },

    async findContentByExternalIds(workspaceId, externalIds) {
      const rows = await inChunks([...externalIds], async (part) =>
        unwrap(await db.from("content_items").select("id, external_id").eq("workspace_id", workspaceId).eq("platform", "instagram").in("external_id", part)),
      );
      return new Map(rows.map((r) => [r.external_id, r.id] as const));
    },

    async insertContent(workspaceId, socialAccountId, fields) {
      const row = unwrap(
        await db
          .from("content_items")
          .insert({
            workspace_id: workspaceId,
            platform: "instagram",
            social_account_id: socialAccountId,
            external_id: fields.externalId,
            shortcode: fields.shortcode,
            url: fields.url,
            format: "short_video",
            published_at: fields.publishedAt ?? null,
            caption: fields.caption ?? null,
            hashtags: fields.hashtags,
            duration_sec: fields.durationSec ?? null,
            missing_fields: fields.missingFields,
          })
          .select("id")
          .single(),
      );
      return row.id;
    },

    async listZernioSnapshotsSince(workspaceId, contentIds, sinceIso) {
      return inChunks([...contentIds], (part) =>
        fetchAllRows((from, to) =>
          db
            .from("metric_snapshots")
            .select("id, content_item_id, captured_at, views, likes, comments, shares, saves, reach, avg_watch_sec, owner_followers")
            .eq("workspace_id", workspaceId)
            .eq("source", "zernio")
            .in("content_item_id", part)
            .gte("captured_at", sinceIso)
            .order("id", { ascending: true })
            .range(from, to),
        ),
      );
    },

    async insertSnapshot(row) {
      unwrap(await db.from("metric_snapshots").insert(normalizeCounts(row)));
    },

    async updateSnapshot(id, row) {
      unwrap(await db.from("metric_snapshots").update(normalizeCounts(row)).eq("id", id).eq("workspace_id", row.workspace_id));
    },
  };
}

/** bigint sütunlarına tam sayı ve ≥ 0 (bozuk tek değer NULL olur). */
function normalizeCounts(row: ZernioSnapshotRow): ZernioSnapshotRow {
  return {
    ...row,
    views: toCount(row.views ?? undefined),
    likes: toCount(row.likes ?? undefined),
    comments: toCount(row.comments ?? undefined),
    shares: toCount(row.shares ?? undefined),
    saves: toCount(row.saves ?? undefined),
    reach: toCount(row.reach ?? undefined),
    owner_followers: toCount(row.owner_followers ?? undefined),
  };
}
