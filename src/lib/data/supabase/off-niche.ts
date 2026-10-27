/**
 * Konu eleğinin niş dışı bulduğu içerik kimlikleri (`content_topic_screens`). TEK okuma: içgörü, anatomi ve iki matris bunu kullanır.
 * Satır yok = elenmedi (niş içi sayılmaz): yalnız `in_niche = false` okunur.
 */
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { fetchAllRows } from "@/lib/data/supabase/paging";

export async function readOffNicheIds(ctx: SupabaseContext, wsId: string): Promise<string[]> {
  const rows = await fetchAllRows((from, to) =>
    ctx.db
      .from("content_topic_screens")
      .select("content_item_id")
      .eq("workspace_id", wsId)
      .eq("in_niche", false)
      .order("content_item_id", { ascending: true })
      .range(from, to)
      .overrideTypes<{ content_item_id: string }[], { merge: false }>(),
  );
  return rows.map((row) => row.content_item_id);
}
