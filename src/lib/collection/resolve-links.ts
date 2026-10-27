/**
 * Toplama sonrası: içerik bekleyen (`awaiting_content`) fikir ↔ Reels bağlarını çöz. Kullanıcı linki verdi = onay: kısa kod artık
 * KENDİ hesap içeriğiyle eşleştiyse bağ `confirmed` olur (fikir `published`: DB trigger'ı; bağ + fikir durumu tek deyimde atomik).
 * Tek bağ hatası (içerik başka fikre bağlı, fikir reddedilmiş) turu durdurmaz: bağ bekleyen kalır, nota yazılır.
 */
import "server-only";

import type { AdminClient } from "@/lib/supabase/admin";

export interface ResolveLinksResult {
  resolved: number;
  notes: string[];
}

function messageOf(error: { message: string }): string {
  return error.message.slice(0, 200);
}

export async function resolveAwaitingLinks(client: AdminClient, workspaceId: string): Promise<ResolveLinksResult> {
  const awaiting = await client.from("idea_content_links").select("id, idea_id, shortcode").eq("workspace_id", workspaceId).eq("status", "awaiting_content");
  if (awaiting.error) return { resolved: 0, notes: [`Bekleyen bağlar okunamadı: ${messageOf(awaiting.error)}`] };
  const links = awaiting.data ?? [];
  if (links.length === 0) return { resolved: 0, notes: [] };

  const [ideas, contents] = await Promise.all([
    client.from("ideas").select("id, platform").eq("workspace_id", workspaceId).in("id", [...new Set(links.map((l) => l.idea_id))]),
    client
      .from("content_items")
      .select("id, platform, shortcode")
      .eq("workspace_id", workspaceId)
      .not("social_account_id", "is", null)
      .in("shortcode", [...new Set(links.map((l) => l.shortcode))]),
  ]);
  if (ideas.error || contents.error) return { resolved: 0, notes: [`Bağ çözümü için veri okunamadı: ${messageOf((ideas.error ?? contents.error) as { message: string })}`] };
  const platformByIdea = new Map((ideas.data ?? []).map((i) => [i.id, i.platform] as const));

  let resolved = 0;
  const notes: string[] = [];
  for (const link of links) {
    const platform = platformByIdea.get(link.idea_id);
    const content = (contents.data ?? []).find((c) => c.shortcode === link.shortcode && c.platform === platform);
    if (!content) continue; // henüz toplanmadı: bekleyen kalır
    const update = await client
      .from("idea_content_links")
      .update({ status: "confirmed", content_item_id: content.id })
      .eq("workspace_id", workspaceId)
      .eq("id", link.id)
      .eq("status", "awaiting_content")
      .select("id");
    if (update.error) notes.push(`Bağ çözülemedi (${link.shortcode}): ${messageOf(update.error)}`);
    else if ((update.data ?? []).length > 0) resolved += 1;
  }
  return { resolved, notes };
}
