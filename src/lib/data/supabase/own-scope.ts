/**
 * Genel bakış ve haftalık özetin ORTAK girdi okumaları: kapsamdaki kendi hesapların içerikleri + snapshot serileri +
 * hesap snapshot'ları ve izlenen rakiplerin tutan içerikleri. Hesap `views/**` ortak fonksiyonlarındadır; bu dosya
 * yalnız veriyi okur (SQL'e hesap kopyalanmaz). Her sorgu `workspace_id` süzgeçli, `in (...)` listeleri ≤50'şer.
 */
import { OUTLIER_MIN_TIER, type AccountSnapshot, type ContentItem, type MetricSnapshot } from "@/lib/domain/content";
import type { Platform } from "@/lib/platforms/types";
import { applySharedContentFilters } from "@/lib/data/supabase/content-filters";
import { hydrateContent } from "@/lib/data/supabase/content-load";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { iso, opt } from "@/lib/data/supabase/mappers/common";
import { CONTENT_SELECT, type ContentRow } from "@/lib/data/supabase/mappers/content";
import { fetchAllRows, inChunks } from "@/lib/data/supabase/paging";

export interface OwnScope {
  items: ContentItem[];
  /** İçerik → snapshot serisi (eskiden yeniye); yalnız `capturedAt` + `views` dolu (kazanılan izlenme hesabı için yeter). */
  snapshotsByItem: Map<string, MetricSnapshot[]>;
  accountSnapshots: AccountSnapshot[];
}

/** Kendi hesapların (verilen kimlikler) tüm içerikleri, snapshot serileri ve hesap snapshot'ları. */
export async function loadOwnScope(ctx: SupabaseContext, wsId: string, accountIds: readonly string[]): Promise<OwnScope> {
  const { db } = ctx;
  const [contentRows, accountRows] = await Promise.all([
    inChunks(accountIds, (part) =>
      fetchAllRows((from, to) =>
        db
          .from("content_items")
          .select(CONTENT_SELECT)
          .eq("workspace_id", wsId)
          .in("social_account_id", part)
          .order("id", { ascending: true })
          .range(from, to)
          .overrideTypes<ContentRow[], { merge: false }>(),
      ),
    ),
    inChunks(accountIds, (part) =>
      fetchAllRows((from, to) =>
        db
          .from("account_snapshots")
          .select("id, social_account_id, captured_at, followers, following, posts_count")
          .eq("workspace_id", wsId)
          .in("social_account_id", part)
          .order("captured_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ),
  ]);
  const items = await hydrateContent(ctx, wsId, contentRows);
  const snapshotRows = await inChunks(items.map((c) => c.id), (part) =>
    fetchAllRows((from, to) =>
      db
        .from("metric_snapshots")
        .select("id, content_item_id, captured_at, views")
        .eq("workspace_id", wsId)
        .in("content_item_id", part)
        .order("captured_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );

  const snapshotsByItem = new Map<string, MetricSnapshot[]>();
  for (const s of snapshotRows) {
    const list = snapshotsByItem.get(s.content_item_id) ?? [];
    list.push({ id: s.id, contentItemId: s.content_item_id, capturedAt: iso(s.captured_at), views: opt(s.views), extra: {} });
    snapshotsByItem.set(s.content_item_id, list);
  }
  const accountSnapshots: AccountSnapshot[] = accountRows.flatMap((s) =>
    s.social_account_id === null
      ? []
      : [
          {
            id: s.id,
            subjectKind: "own" as const,
            subjectId: s.social_account_id,
            capturedAt: iso(s.captured_at),
            followers: opt(s.followers),
            following: opt(s.following),
            postsCount: opt(s.posts_count),
            extra: {},
          },
        ],
  );
  return { items, snapshotsByItem, accountSnapshots };
}

export interface OutlierWindow {
  /** `published_at >= since`. */
  since: string;
  /** `published_at <= until` (verilmezse üst sınır yok). */
  until?: string;
  /** Verilen her platform süzgeci uygulanır (VE). */
  platforms?: readonly Platform[];
}

/** İzlenen rakiplerin tutan (kademe ≥ 3) içerikleri, lift'e göre azalan; `listOutliers` ile AYNI küme/sıra. */
export async function loadOutlierItems(ctx: SupabaseContext, wsId: string, window: OutlierWindow): Promise<ContentItem[]> {
  const rows = await fetchAllRows((from, to) => {
    let q = applySharedContentFilters(ctx.db.from("content_items").select(`${CONTENT_SELECT}, competitors!inner(status)`).eq("workspace_id", wsId), {
      minTier: OUTLIER_MIN_TIER,
      since: window.since,
    }).eq("competitors.status", "tracked");
    if (window.until) q = q.lte("published_at", window.until);
    for (const platform of window.platforms ?? []) q = q.eq("platform", platform);
    return q
      .order("lift", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to)
      .overrideTypes<ContentRow[], { merge: false }>();
  });
  return hydrateContent(ctx, wsId, rows);
}
