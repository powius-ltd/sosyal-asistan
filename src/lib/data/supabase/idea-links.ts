/**
 * Fikir ↔ Reels bağı (Supabase). Durum kurallarını DB trigger'ları taşır (`0010_outcomes.sql`): onay → fikir `published` + önceki
 * durum `prev_idea_status`'ta; bağ `confirmed`'dan çıkınca (rejected/silme) fikir önceki duruma döner; yalnız kendi hesap içeriği;
 * fikir/içerik başına tek onaylı bağ (kısmi benzersiz index). Bağ + fikir durumu TEK deyimle atomik değişir; depo yalnız doğrular,
 * kısa kodu eşler ve satırı yazar/günceller (unique ihlali 23505 → `already_exists`).
 * Girdi doğrulaması ortaktır: `lib/data/idea-link-input.ts`. Sözleşme: `contract/outcomes.ts` (mock ile aynı süit).
 */
import { parseLinkIdeaToReelInput, parseReelShortcode, parseResolveIdeaLinkInput } from "@/lib/data/idea-link-input";
import type { IdeaLinkFilter } from "@/lib/data/queries";
import { RepositoryError } from "@/lib/data/repository";
import { loadContentSummaries } from "@/lib/data/supabase/content-summaries";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { isUuid, unwrap } from "@/lib/data/supabase/errors";
import { getIdea } from "@/lib/data/supabase/ideas";
import { ideaStatusOf } from "@/lib/data/supabase/mappers/enums";
import { IDEA_LINK_COLUMNS, toIdeaLink, type IdeaLinkRow } from "@/lib/data/supabase/mappers/idea-links";
import { clampLimit } from "@/lib/data/supabase/paging";
import { requireWorkspace } from "@/lib/data/supabase/workspace";
import { canConfirmIdeaLink, type Idea } from "@/lib/domain/intel";
import type { IdeaLink, IdeaLinkDecision } from "@/lib/domain/outcomes";
import type { Platform } from "@/lib/platforms/types";

const ACTIVE_STATUSES = ["awaiting_content", "confirmed"];
const DISMISSED_MESSAGE = "Reddedilmiş fikre Reels bağlanamaz; önce fikri geri al.";

async function toLinks(ctx: SupabaseContext, wsId: string, rows: readonly IdeaLinkRow[]): Promise<IdeaLink[]> {
  const summaries = await loadContentSummaries(ctx, wsId, rows.flatMap((r) => (r.content_item_id === null ? [] : [r.content_item_id])));
  return rows.map((row) => toIdeaLink(row, row.content_item_id === null ? undefined : summaries.get(row.content_item_id)?.summary));
}

async function readIdea(ctx: SupabaseContext, wsId: string, ideaId: string): Promise<{ id: string; status: Idea["status"]; platform: Platform }> {
  const row = isUuid(ideaId) ? unwrap(await ctx.db.from("ideas").select("id, status, platform").eq("workspace_id", wsId).eq("id", ideaId).maybeSingle()) : null;
  if (!row) throw new RepositoryError("not_found", `Fikir bulunamadı: ${ideaId}`);
  return { id: row.id, status: ideaStatusOf(row.status), platform: row.platform };
}

async function readLinkById(ctx: SupabaseContext, wsId: string, linkId: string): Promise<IdeaLinkRow | null> {
  if (!isUuid(linkId)) return null;
  return unwrap(await ctx.db.from("idea_content_links").select(IDEA_LINK_COLUMNS).eq("workspace_id", wsId).eq("id", linkId).maybeSingle());
}

/** Fikrin aktif (bekleyen ya da onaylı) bağı; `exceptId` verilirse o satır sayılmaz. */
async function readActiveLink(ctx: SupabaseContext, wsId: string, ideaId: string, exceptId?: string): Promise<IdeaLinkRow | null> {
  let query = ctx.db.from("idea_content_links").select(IDEA_LINK_COLUMNS).eq("workspace_id", wsId).eq("idea_id", ideaId).in("status", ACTIVE_STATUSES);
  if (exceptId !== undefined) query = query.neq("id", exceptId);
  return unwrap(await query.limit(1).maybeSingle());
}

async function readLinkByCode(ctx: SupabaseContext, wsId: string, ideaId: string, shortcode: string): Promise<IdeaLinkRow | null> {
  return unwrap(await ctx.db.from("idea_content_links").select(IDEA_LINK_COLUMNS).eq("workspace_id", wsId).eq("idea_id", ideaId).eq("shortcode", shortcode).maybeSingle());
}

/** Fikrin platformunda, aynı kısa kodlu KENDİ hesap içeriğinin kimliği (rakip içeriği sayılmaz). */
async function findOwnContentId(ctx: SupabaseContext, wsId: string, platform: Platform, shortcode: string): Promise<string | undefined> {
  const rows = unwrap(
    await ctx.db
      .from("content_items")
      .select("id")
      .eq("workspace_id", wsId)
      .eq("platform", platform)
      .eq("shortcode", shortcode)
      .not("social_account_id", "is", null)
      .order("id", { ascending: true })
      .limit(1),
  );
  return rows[0]?.id;
}

/** İçerik başka bir fikre ONAYLI bağlıysa (kendi fikri `exceptIdeaId` sayılmaz) `already_exists`. */
async function assertContentFree(ctx: SupabaseContext, wsId: string, contentId: string, exceptIdeaId: string): Promise<void> {
  const taken = unwrap(
    await ctx.db.from("idea_content_links").select("id").eq("workspace_id", wsId).eq("content_item_id", contentId).eq("status", "confirmed").neq("idea_id", exceptIdeaId).limit(1),
  );
  if (taken.length > 0) throw new RepositoryError("already_exists", "Bu Reels zaten başka bir fikre bağlı.");
}

export async function listIdeaLinks(ctx: SupabaseContext, wsId: string, filter: IdeaLinkFilter = {}): Promise<IdeaLink[]> {
  if (!isUuid(wsId) || (filter.ideaId !== undefined && !isUuid(filter.ideaId))) return [];
  const statuses = filter.status === undefined ? undefined : Array.isArray(filter.status) ? filter.status : [filter.status];
  let query = ctx.db.from("idea_content_links").select(IDEA_LINK_COLUMNS).eq("workspace_id", wsId);
  if (filter.ideaId !== undefined) query = query.eq("idea_id", filter.ideaId);
  if (statuses !== undefined) query = query.in("status", statuses);
  const rows = unwrap(await query.order("updated_at", { ascending: false }).order("id", { ascending: true }).limit(clampLimit(filter.limit)));
  return toLinks(ctx, wsId, rows);
}

export async function linkIdeaToReel(ctx: SupabaseContext, wsId: string, input: { ideaId: string; url: string }): Promise<IdeaLink> {
  await requireWorkspace(ctx, wsId);
  const valid = parseLinkIdeaToReelInput(input);
  const idea = await readIdea(ctx, wsId, valid.ideaId);
  const shortcode = parseReelShortcode(idea.platform, valid.url);
  if (!canConfirmIdeaLink(idea.status)) throw new RepositoryError("invalid_state", DISMISSED_MESSAGE);

  const [active, existing, contentId] = await Promise.all([
    readActiveLink(ctx, wsId, idea.id),
    readLinkByCode(ctx, wsId, idea.id, shortcode),
    findOwnContentId(ctx, wsId, idea.platform, shortcode),
  ]);
  if (active?.status === "confirmed") {
    if (active.shortcode === shortcode) return (await toLinks(ctx, wsId, [active]))[0]; // idempotent
    throw new RepositoryError("already_exists", "Bu fikir zaten başka bir Reels'e bağlı; önce bağı kaldır.");
  }
  if (contentId !== undefined) await assertContentFree(ctx, wsId, contentId, idea.id);
  if (contentId === undefined && existing !== null && existing.status !== "awaiting_content") {
    throw new RepositoryError("invalid_state", "Bu bağ içerik beklemiyor."); // içeriksiz satır yalnız bekleyen olur
  }

  // Fikrin farklı kodlu bekleyen bağı yenisinin yerine geçer (fikir başına tek aktif bağ).
  if (active !== null && active.id !== existing?.id) unwrap(await ctx.db.from("idea_content_links").delete().eq("workspace_id", wsId).eq("id", active.id));

  let row: IdeaLinkRow;
  if (existing !== null) {
    if (contentId === undefined) row = existing; // zaten bekliyor
    else {
      // Kullanıcı linki verdi = onay: öneri/reddedilmiş/bekleyen satır onaylanır (fikir `published` olur: trigger).
      row = unwrap(
        await ctx.db
          .from("idea_content_links")
          .update({ status: "confirmed", origin: "manual_url", content_item_id: contentId })
          .eq("workspace_id", wsId)
          .eq("id", existing.id)
          .select(IDEA_LINK_COLUMNS)
          .single(),
      );
    }
  } else {
    row = unwrap(
      await ctx.db
        .from("idea_content_links")
        .insert({
          workspace_id: wsId,
          idea_id: idea.id,
          shortcode,
          origin: "manual_url",
          status: contentId === undefined ? "awaiting_content" : "confirmed",
          content_item_id: contentId ?? null,
          reasons: [],
        })
        .select(IDEA_LINK_COLUMNS)
        .single(),
    );
  }
  return (await toLinks(ctx, wsId, [row]))[0];
}

export async function resolveIdeaLink(ctx: SupabaseContext, wsId: string, linkId: string, decision: IdeaLinkDecision): Promise<IdeaLink> {
  await requireWorkspace(ctx, wsId);
  const valid = parseResolveIdeaLinkInput(linkId, decision);
  const link = await readLinkById(ctx, wsId, valid.linkId);
  if (!link) throw new RepositoryError("not_found", `Bağ bulunamadı: ${valid.linkId}`);
  if (link.status !== "suggested") throw new RepositoryError("invalid_state", "Yalnız bekleyen öneri onaylanır ya da reddedilir.");

  if (valid.decision === "confirm") {
    const idea = await readIdea(ctx, wsId, link.idea_id);
    if (!canConfirmIdeaLink(idea.status)) throw new RepositoryError("invalid_state", DISMISSED_MESSAGE);
    if (await readActiveLink(ctx, wsId, idea.id, link.id)) throw new RepositoryError("already_exists", "Bu fikir zaten bir Reels'e bağlı.");
    if (link.content_item_id === null) throw new RepositoryError("not_found", "Önerilen içerik bulunamadı.");
    await assertContentFree(ctx, wsId, link.content_item_id, idea.id);
  }
  // İyimser eşzamanlılık: satır hâlâ `suggested` ise güncellenir (başkası bu sırada karar vermiş olabilir).
  const updated = unwrap(
    await ctx.db
      .from("idea_content_links")
      .update({ status: valid.decision === "confirm" ? "confirmed" : "rejected" })
      .eq("workspace_id", wsId)
      .eq("id", link.id)
      .eq("status", "suggested")
      .select(IDEA_LINK_COLUMNS)
      .maybeSingle(),
  );
  if (!updated) throw new RepositoryError("invalid_state", "Öneri bu sırada başka biri tarafından çözüldü; yenile.");
  return (await toLinks(ctx, wsId, [updated]))[0];
}

export async function unlinkIdea(ctx: SupabaseContext, wsId: string, ideaId: string): Promise<Idea> {
  await requireWorkspace(ctx, wsId);
  const idea = await readIdea(ctx, wsId, ideaId);
  const active = await readActiveLink(ctx, wsId, idea.id);
  if (!active) throw new RepositoryError("not_found", "Bu fikrin Reels bağı yok.");
  if (active.status === "awaiting_content") {
    unwrap(await ctx.db.from("idea_content_links").delete().eq("workspace_id", wsId).eq("id", active.id));
  } else {
    // Onaylı bağ kalkar (satır `rejected` kalır: aynı çift tekrar önerilmez); fikir önceki duruma döner (trigger).
    unwrap(await ctx.db.from("idea_content_links").update({ status: "rejected" }).eq("workspace_id", wsId).eq("id", active.id).eq("status", "confirmed").select("id"));
  }
  const updated = await getIdea(ctx, wsId, idea.id);
  if (!updated) throw new RepositoryError("not_found", `Fikir bulunamadı: ${ideaId}`);
  return updated;
}
