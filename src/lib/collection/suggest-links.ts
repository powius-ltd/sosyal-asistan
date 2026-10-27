/**
 * Toplama sonrası: fikir ↔ yeni Reels otomatik eşleşme ÖNERİSİ. Hesap `lib/outcomes/idea-match.ts` (saf); burada yalnız aday
 * okuma + `suggested` satır/bildirim yazma. Sessiz bağ YOK: yazılan satır `suggested` + `auto_match` + skor; fikre dokunulmaz,
 * onay kullanıcıdadır. Aynı (fikir, kısa kod) çifti tekrar önerilmez (her durumdaki satır dışlanır; bildirim `dedupe_key`'li).
 */
import "server-only";

import { canConfirmIdeaLink } from "@/lib/domain/intel";
import { suggestMatches, type MatchIdea, type MatchReel } from "@/lib/outcomes/idea-match";
import { ideaLinkSuggestedDraft, insertNotification } from "@/lib/outcomes/notify";
import { ideaStatusOf } from "@/lib/data/supabase/mappers/enums";
import { stringList } from "@/lib/data/supabase/mappers/common";
import { toIdeaDetails } from "@/lib/data/supabase/mappers/idea-details";
import { inChunks } from "@/lib/data/supabase/paging";
import type { AdminClient } from "@/lib/supabase/admin";
import { DAY_MS } from "@/lib/time";

/** Yalnız bu kadar gün içinde yayınlanan Reels'ler aday olur (eski içeriğe metin benzerliğiyle öneri üretilmez). */
export const SUGGEST_REEL_LOOKBACK_DAYS = 30;

export interface SuggestLinksResult {
  suggested: number;
  notified: number;
  notes: string[];
}

const EMPTY: SuggestLinksResult = { suggested: 0, notified: 0, notes: [] };

/** Bağlanabilir fikirler (reddedilmemiş, aktif bağı yok) + planlanan slotları. */
async function loadIdeas(client: AdminClient, ws: string): Promise<{ ideas: (MatchIdea & { title: string })[]; excluded: Set<string> } | string> {
  const [ideaRows, links, slots] = await Promise.all([
    client.from("ideas").select("id, status, title, hooks, details").eq("workspace_id", ws),
    client.from("idea_content_links").select("idea_id, shortcode, status").eq("workspace_id", ws),
    client.from("weekly_plan_items").select("idea_id, slot_at").eq("workspace_id", ws).not("slot_at", "is", null),
  ]);
  const failed = ideaRows.error ?? links.error ?? slots.error;
  if (failed) return `Öneri için fikirler okunamadı: ${failed.message.slice(0, 200)}`;

  const activeIdeas = new Set((links.data ?? []).filter((l) => l.status === "awaiting_content" || l.status === "confirmed").map((l) => l.idea_id));
  const excluded = new Set((links.data ?? []).map((l) => `${l.idea_id}|${l.shortcode}`));
  // Fikrin en yeni slotu (birden çok planda yer alabilir).
  const slotByIdea = new Map<string, string>();
  for (const slot of slots.data ?? []) {
    if (slot.slot_at === null) continue;
    const current = slotByIdea.get(slot.idea_id);
    if (current === undefined || Date.parse(slot.slot_at) > Date.parse(current)) slotByIdea.set(slot.idea_id, slot.slot_at);
  }
  const ideas = (ideaRows.data ?? [])
    .filter((row) => canConfirmIdeaLink(ideaStatusOf(row.status)) && !activeIdeas.has(row.id))
    .map((row) => ({
      id: row.id,
      title: row.title,
      hooks: stringList(row.hooks),
      captionDraft: toIdeaDetails(row.details).captionDraft,
      plannedAt: slotByIdea.get(row.id),
    }));
  return { ideas, excluded };
}

/** Aday Reels'ler: kendi hesap, kısa kodlu, son 30 gün, başka fikre onaylı değil. */
async function loadReels(client: AdminClient, ws: string, now: Date): Promise<MatchReel[] | string> {
  const since = new Date(now.getTime() - SUGGEST_REEL_LOOKBACK_DAYS * DAY_MS).toISOString();
  const [reels, confirmed] = await Promise.all([
    client
      .from("content_items")
      .select("id, shortcode, caption, published_at")
      .eq("workspace_id", ws)
      .not("social_account_id", "is", null)
      .eq("format", "short_video")
      .not("shortcode", "is", null)
      .gte("published_at", since),
    client.from("idea_content_links").select("content_item_id").eq("workspace_id", ws).eq("status", "confirmed"),
  ]);
  const failed = reels.error ?? confirmed.error;
  if (failed) return `Öneri için Reels'ler okunamadı: ${failed.message.slice(0, 200)}`;
  const taken = new Set((confirmed.data ?? []).map((l) => l.content_item_id));
  const rows = (reels.data ?? []).filter((r) => !taken.has(r.id) && r.shortcode !== null);
  if (rows.length === 0) return [];

  // Kimlik listesi parçalanır (URL uzunluğu); bir parça düşerse hata `afterCollect` notuna yazılır, tur sürer.
  const analyses = await inChunks(
    rows.map((r) => r.id),
    async (part) => {
      const result = await client.from("content_analyses").select("content_item_id, hook_text").eq("workspace_id", ws).eq("status", "ok").in("content_item_id", part);
      if (result.error) throw new Error(`Öneri için analizler okunamadı: ${result.error.message.slice(0, 200)}`);
      return result.data ?? [];
    },
  );
  const hookById = new Map(analyses.map((a) => [a.content_item_id, a.hook_text ?? undefined] as const));
  return rows.map((r) => ({
    contentItemId: r.id,
    shortcode: r.shortcode as string,
    caption: r.caption ?? undefined,
    hookText: hookById.get(r.id),
    publishedAt: r.published_at ?? undefined,
  }));
}

export async function suggestLinks(client: AdminClient, workspaceId: string, now: Date): Promise<SuggestLinksResult> {
  const [ideas, reels] = await Promise.all([loadIdeas(client, workspaceId), loadReels(client, workspaceId, now)]);
  if (typeof ideas === "string") return { ...EMPTY, notes: [ideas] };
  if (typeof reels === "string") return { ...EMPTY, notes: [reels] };
  if (ideas.ideas.length === 0 || reels.length === 0) return EMPTY;

  const titleById = new Map(ideas.ideas.map((i) => [i.id, i.title] as const));
  const result: SuggestLinksResult = { suggested: 0, notified: 0, notes: [] };
  for (const match of suggestMatches(ideas.ideas, reels, ideas.excluded)) {
    const insert = await client.from("idea_content_links").insert({
      workspace_id: workspaceId,
      idea_id: match.ideaId,
      shortcode: match.shortcode,
      content_item_id: match.contentItemId,
      status: "suggested",
      origin: "auto_match",
      score: match.score,
      reasons: match.reasons,
    });
    if (insert.error) {
      if (insert.error.code !== "23505") result.notes.push(`Öneri yazılamadı (${match.shortcode}): ${insert.error.message.slice(0, 200)}`);
      continue;
    }
    result.suggested += 1;
    try {
      const draft = ideaLinkSuggestedDraft({ ...match, ideaTitle: titleById.get(match.ideaId) ?? "fikir" });
      if (await insertNotification(client, workspaceId, draft)) result.notified += 1;
    } catch (error) {
      result.notes.push(error instanceof Error ? error.message : "Öneri bildirimi yazılamadı.");
    }
  }
  return result;
}
