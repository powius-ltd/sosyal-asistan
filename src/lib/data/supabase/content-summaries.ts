/**
 * İçerik ÖZETLERİ (`ContentSummary`): fikir kanıtı, koleksiyon öğesi ve haftalık özet aynı özeti kullanır
 * (`summarizeContent`). Kimlik listesi için tek seferde okunur (içerik başına okuma yok): içerik satırları + sahipler
 * + analiz (hook türü). Metrik okunmaz (özet lift'i `content_items` önbelleğinden alır).
 */
import { summarizeContent, type ContentSummary } from "@/lib/domain/content-summary";
import type { ContentItem } from "@/lib/domain/content";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { unwrap } from "@/lib/data/supabase/errors";
import { hydrateContent } from "@/lib/data/supabase/content-load";
import { CONTENT_SELECT, type ContentRow } from "@/lib/data/supabase/mappers/content";
import { analysisStatusOf } from "@/lib/data/supabase/mappers/enums";
import { inChunks } from "@/lib/data/supabase/paging";

/** Kimliklerin içerik satırları (workspace süzgeçli; bulunamayan kimlik sonuçta yoktur). */
export async function loadContentRows(ctx: SupabaseContext, wsId: string, contentIds: readonly string[]): Promise<ContentRow[]> {
  return inChunks([...new Set(contentIds)], async (part) =>
    unwrap(await ctx.db.from("content_items").select(CONTENT_SELECT).eq("workspace_id", wsId).in("id", part).overrideTypes<ContentRow[], { merge: false }>()),
  );
}

/** Analiz özeti: yalnız `ok` analiz hook türü verir (`summarizeContent`). */
export async function loadAnalysisHooks(ctx: SupabaseContext, wsId: string, contentIds: readonly string[]) {
  const rows = await inChunks([...new Set(contentIds)], async (part) =>
    unwrap(await ctx.db.from("content_analyses").select("content_item_id, status, hook_type").eq("workspace_id", wsId).in("content_item_id", part)),
  );
  return new Map(rows.map((r) => [r.content_item_id, { status: analysisStatusOf(r.status), hookType: r.hook_type ?? undefined }] as const));
}

/** Kimlik → içerik + özet. Yardımcı: çağıran gerekiyorsa `ContentItem`'a da erişir (ör. koleksiyon sırası). */
export async function loadContentSummaries(
  ctx: SupabaseContext,
  wsId: string,
  contentIds: readonly string[],
): Promise<Map<string, { item: ContentItem; summary: ContentSummary }>> {
  if (contentIds.length === 0) return new Map();
  const rows = await loadContentRows(ctx, wsId, contentIds);
  const [items, hooks] = await Promise.all([hydrateContent(ctx, wsId, rows, { metrics: false }), loadAnalysisHooks(ctx, wsId, rows.map((r) => r.id))]);
  return new Map(items.map((item) => [item.id, { item, summary: summarizeContent(item, hooks.get(item.id)) }] as const));
}
