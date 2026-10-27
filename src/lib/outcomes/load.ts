/**
 * Ölçüm/geçen hafta/öneri için DB okumaları (service role; her sorgu açıkça `workspace_id` süzgeçli, sabit sayıda istek).
 * Hesap burada YAPILMAZ: satırlar `OutcomeContent`/`MatchReel` olarak kurulur, hesap `lib/outcomes/*` saf modüllerindedir
 * (Supabase deposu, `measure:check`, `afterCollect` aynı okumayı kullanır).
 */
import "server-only";

import { fetchAllRows, inChunks } from "@/lib/data/supabase/paging";
import { unwrap } from "@/lib/data/supabase/errors";
import type { MeasurementDue } from "@/lib/domain/outcomes";
import { buildMeasurementDue, measureLookbackStart } from "@/lib/outcomes/due";
import type { OutcomeContent } from "@/lib/outcomes/content";
import type { SnapshotPoint } from "@/lib/outcomes/checkpoints";
import type { AdminClient } from "@/lib/supabase/admin";

/** İçerik kimliklerinin hesap girdileri: içerik + sahip takipçisi + ölçümler + analiz hook'u (4 sorgu). */
export async function loadOutcomeContents(db: AdminClient, wsId: string, contentIds: readonly string[]): Promise<Map<string, OutcomeContent>> {
  const ids = [...new Set(contentIds)];
  if (ids.length === 0) return new Map();

  const items = await inChunks(ids, async (part) =>
    unwrap(
      await db
        .from("content_items")
        .select("id, social_account_id, shortcode, url, published_at, caption, duration_sec, views_kind, baseline_views")
        .eq("workspace_id", wsId)
        .in("id", part),
    ),
  );
  const accountIds = [...new Set(items.flatMap((i) => (i.social_account_id === null ? [] : [i.social_account_id])))];
  const [accounts, snapshotRows, analyses] = await Promise.all([
    inChunks(accountIds, async (part) => unwrap(await db.from("social_accounts").select("id, handle, followers").eq("workspace_id", wsId).in("id", part))),
    inChunks(ids, (part) =>
      fetchAllRows((from, to) =>
        db
          .from("metric_snapshots")
          .select("id, content_item_id, captured_at, views, views_kind, owner_followers")
          .eq("workspace_id", wsId)
          .in("content_item_id", part)
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ),
    inChunks(ids, async (part) =>
      unwrap(await db.from("content_analyses").select("content_item_id, status, hook_type, evidence_verified").eq("workspace_id", wsId).in("content_item_id", part)),
    ),
  ]);

  const accountById = new Map(accounts.map((a) => [a.id, a] as const));
  const analysisById = new Map(analyses.map((a) => [a.content_item_id, a] as const));
  const snapshotsById = new Map<string, SnapshotPoint[]>();
  for (const row of snapshotRows) {
    const point: SnapshotPoint = {
      capturedAt: new Date(row.captured_at).toISOString(),
      views: row.views ?? undefined,
      viewsKind: row.views_kind ?? undefined,
      ownerFollowers: row.owner_followers ?? undefined,
    };
    snapshotsById.set(row.content_item_id, [...(snapshotsById.get(row.content_item_id) ?? []), point]);
  }

  const contents = new Map<string, OutcomeContent>();
  for (const item of items) {
    const account = item.social_account_id === null ? undefined : accountById.get(item.social_account_id);
    const analysis = analysisById.get(item.id);
    contents.set(item.id, {
      id: item.id,
      ownerHandle: account?.handle ?? "bilinmiyor",
      shortcode: item.shortcode ?? undefined,
      url: item.url ?? undefined,
      publishedAt: item.published_at === null ? undefined : new Date(item.published_at).toISOString(),
      durationSec: item.duration_sec ?? undefined,
      caption: item.caption ?? undefined,
      followers: account?.followers ?? undefined,
      baselineViews: item.baseline_views ?? undefined,
      baselineViewsKind: item.views_kind ?? undefined,
      analysisHookType: analysis?.status === "ok" && analysis.evidence_verified && analysis.hook_type ? analysis.hook_type : undefined,
      snapshots: snapshotsById.get(item.id) ?? [],
    });
  }
  return contents;
}

/** Ölçüm penceresi hâlâ açık olabilecek kendi Reels'lerin kimlikleri (son 10 gün; yeniden eskiye). */
export async function listOwnRecentReelIds(db: AdminClient, wsId: string, now: Date, limit?: number): Promise<string[]> {
  let query = db
    .from("content_items")
    .select("id")
    .eq("workspace_id", wsId)
    .not("social_account_id", "is", null)
    .eq("format", "short_video")
    .gte("published_at", measureLookbackStart(now))
    .lte("published_at", now.toISOString())
    .order("published_at", { ascending: false })
    .order("id", { ascending: true });
  if (limit !== undefined) query = query.limit(limit);
  return unwrap(await query).map((row) => row.id);
}

/** Onaylı bağı olan içerikler → fikir kimliği ("ölçüm zamanı geldi" satırı hangi fikre ait). */
export async function loadConfirmedIdeaIds(db: AdminClient, wsId: string, contentIds: readonly string[]): Promise<Map<string, string>> {
  const rows = await inChunks([...new Set(contentIds)], async (part) =>
    unwrap(await db.from("idea_content_links").select("idea_id, content_item_id").eq("workspace_id", wsId).eq("status", "confirmed").in("content_item_id", part)),
  );
  return new Map(rows.flatMap((row) => (row.content_item_id === null ? [] : [[row.content_item_id, row.idea_id] as const])));
}

/** Fikir başına bekleyen (`suggested`) öneri sayısı. */
export async function loadSuggestionCounts(db: AdminClient, wsId: string, ideaIds: readonly string[]): Promise<Map<string, number>> {
  const rows = await inChunks([...new Set(ideaIds)], async (part) =>
    unwrap(await db.from("idea_content_links").select("idea_id").eq("workspace_id", wsId).eq("status", "suggested").in("idea_id", part)),
  );
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.idea_id, (counts.get(row.idea_id) ?? 0) + 1);
  return counts;
}

/** Ölçümü gelen (penceresi açık, ölçümü olmayan) kendi Reels'ler; `listMeasurementDue` ve `measure:check` ortak okuması. */
export async function loadMeasurementDue(db: AdminClient, wsId: string, now: Date): Promise<MeasurementDue[]> {
  const reelIds = await listOwnRecentReelIds(db, wsId, now);
  if (reelIds.length === 0) return [];
  const [contents, ideaByContent] = await Promise.all([loadOutcomeContents(db, wsId, reelIds), loadConfirmedIdeaIds(db, wsId, reelIds)]);
  return buildMeasurementDue([...contents.values()], now, ideaByContent);
}
