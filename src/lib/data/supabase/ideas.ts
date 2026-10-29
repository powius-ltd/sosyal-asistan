/**
 * Fikir kartları: liste (kanıt özetiyle, N+1 yok), durum sayıları ve durum geçişi. Üretimi sunucu yapar (F2);
 * kullanıcı yalnız durumu değiştirir. Geçiş kuralları `canTransitionIdea` (tek yer); DB yalnız durum değerini denetler.
 */
import { applyIdeaRevision, parseIdeaRevision } from "@/lib/data/idea-revision-input";
import type { Json } from "@/lib/supabase/database.types";
import { canTransitionIdea, IDEA_STATUSES, type Idea, type IdeaEvidence, type IdeaPlanLink, type IdeaStatus } from "@/lib/domain/intel";
import type { IdeaFilter } from "@/lib/data/queries";
import { RepositoryError } from "@/lib/data/repository";
import { loadContentSummaries } from "@/lib/data/supabase/content-summaries";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { isUuid, unwrap } from "@/lib/data/supabase/errors";
import { firstOf, opt } from "@/lib/data/supabase/mappers/common";
import { ideaStatusOf } from "@/lib/data/supabase/mappers/enums";
import { REEL_LINK_COLUMNS, toReelLink } from "@/lib/data/supabase/mappers/idea-links";
import { EVIDENCE_COLUMNS, IDEA_COLUMNS, toIdea, type IdeaRow } from "@/lib/data/supabase/mappers/ideas";
import { clampLimit, fetchAllRows, inChunks } from "@/lib/data/supabase/paging";
import { requireWorkspace } from "@/lib/data/supabase/workspace";

const asArray = <T>(value: T | T[] | undefined): T[] | undefined => (value === undefined ? undefined : Array.isArray(value) ? value : [value]);

interface PlanItemRow {
  idea_id: string;
  plan_id: string;
  position: number | null;
  weekly_plans: { week_start: string } | { week_start: string }[] | null;
}

/** Fikir başına bağlı olduğu EN YENİ haftalık plan (Fikirler plan rozeti). */
function planLinks(rows: readonly PlanItemRow[]): Map<string, IdeaPlanLink> {
  const links = new Map<string, IdeaPlanLink>();
  for (const row of rows) {
    const weekStart = firstOf(row.weekly_plans)?.week_start;
    if (weekStart === undefined) continue;
    const current = links.get(row.idea_id);
    if (current === undefined || weekStart > current.weekStart) {
      links.set(row.idea_id, { planId: row.plan_id, weekStart, position: opt(row.position) });
    }
  }
  return links;
}

/** Fikirleri kanıt özetleri, bağlı yayın işi, haftalık plan bağı ve aktif Reels bağıyla tamamlar (sabit sayıda istek). */
async function hydrateIdeas(ctx: SupabaseContext, wsId: string, rows: readonly IdeaRow[]): Promise<Idea[]> {
  if (rows.length === 0) return [];
  const ideaIds = rows.map((r) => r.id);
  const [evidenceRows, jobRows, planRows, linkRows] = await Promise.all([
    inChunks(ideaIds, (part) =>
      fetchAllRows((from, to) =>
        ctx.db
          .from("idea_evidence")
          .select(EVIDENCE_COLUMNS)
          .eq("workspace_id", wsId)
          .in("idea_id", part)
          .order("lift_at_creation", { ascending: false, nullsFirst: false }) // ölçülemeyen (NULL) sona
          .order("idea_id", { ascending: true })
          .order("content_item_id", { ascending: true })
          .range(from, to),
      ),
    ),
    // Bağlı yayın işi: fikrin en yeni (iptal edilmemiş) işi.
    inChunks(ideaIds, (part) =>
      fetchAllRows((from, to) =>
        ctx.db
          .from("publish_jobs")
          .select("id, idea_id, created_at")
          .eq("workspace_id", wsId)
          .in("idea_id", part)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ),
    inChunks(ideaIds, (part) =>
      fetchAllRows((from, to) =>
        ctx.db
          .from("weekly_plan_items")
          .select("idea_id, plan_id, position, weekly_plans!inner(week_start)")
          .eq("workspace_id", wsId)
          .in("idea_id", part)
          .order("idea_id", { ascending: true })
          .order("plan_id", { ascending: true })
          .range(from, to)
          .overrideTypes<PlanItemRow[], { merge: false }>(),
      ),
    ),
    // Aktif Reels bağı (onaylı ya da içerik bekleyen; fikir başına en çok bir): öneriler/reddedilenler fikre gömülmez.
    inChunks(ideaIds, async (part) =>
      unwrap(
        await ctx.db
          .from("idea_content_links")
          .select(REEL_LINK_COLUMNS)
          .eq("workspace_id", wsId)
          .in("idea_id", part)
          .in("status", ["awaiting_content", "confirmed"]),
      ),
    ),
  ]);
  const linkedContentIds = linkRows.flatMap((l) => (l.content_item_id === null ? [] : [l.content_item_id]));
  const summaries = await loadContentSummaries(ctx, wsId, [...evidenceRows.map((e) => e.content_item_id), ...linkedContentIds]);

  const evidenceByIdea = new Map<string, IdeaEvidence[]>();
  for (const e of evidenceRows) {
    const summary = summaries.get(e.content_item_id)?.summary;
    if (!summary) continue; // içerik (artık) yok: cascade FK normalde engeller
    evidenceByIdea.set(e.idea_id, [...(evidenceByIdea.get(e.idea_id) ?? []), { ...summary, ...(e.lift_at_creation === null ? {} : { liftAtCreation: e.lift_at_creation }) }]);
  }
  const jobByIdea = new Map<string, string>();
  for (const job of jobRows) if (job.idea_id !== null && !jobByIdea.has(job.idea_id)) jobByIdea.set(job.idea_id, job.id);
  const linkByIdea = planLinks(planRows);
  const reelLinkByIdea = new Map(linkRows.map((l) => [l.idea_id, toReelLink(l, l.content_item_id === null ? undefined : summaries.get(l.content_item_id)?.summary)] as const));
  return rows.map((row) => ({
    ...toIdea(row, evidenceByIdea.get(row.id) ?? [], jobByIdea.get(row.id), linkByIdea.get(row.id)),
    reelLink: reelLinkByIdea.get(row.id),
  }));
}

/** Kimlikleri verilen fikirler (kanıt özetleri ve plan bağıyla); bulunamayan kimlik sonuçta yoktur. Haftalık plan okuması kullanır. */
export async function loadIdeasByIds(ctx: SupabaseContext, wsId: string, ideaIds: readonly string[]): Promise<Idea[]> {
  const rows = await inChunks([...new Set(ideaIds)], async (part) =>
    unwrap(await ctx.db.from("ideas").select(IDEA_COLUMNS).eq("workspace_id", wsId).in("id", part)),
  );
  return hydrateIdeas(ctx, wsId, rows);
}

export async function listIdeas(ctx: SupabaseContext, wsId: string, filter: IdeaFilter = {}): Promise<Idea[]> {
  if (!isUuid(wsId)) return [];
  let query = ctx.db.from("ideas").select(IDEA_COLUMNS).eq("workspace_id", wsId);
  const statuses = asArray(filter.status);
  if (statuses) query = query.in("status", statuses);
  if (filter.platform) query = query.eq("platform", filter.platform);
  const rows = unwrap(await query.order("rank_score", { ascending: false }).order("id", { ascending: true }).limit(clampLimit(filter.limit)));
  return hydrateIdeas(ctx, wsId, rows);
}

/** Durum başına fikir sayısı; tüm `IdeaStatus` anahtarları vardır (0 dahil), liste limitinden bağımsızdır. */
export async function countIdeasByStatus(ctx: SupabaseContext, wsId: string): Promise<Record<IdeaStatus, number>> {
  await requireWorkspace(ctx, wsId);
  const rows = await fetchAllRows((from, to) =>
    ctx.db.from("ideas").select("id, status").eq("workspace_id", wsId).order("id", { ascending: true }).range(from, to),
  );
  const counts = Object.fromEntries(IDEA_STATUSES.map((status) => [status, 0])) as Record<IdeaStatus, number>;
  for (const row of rows) counts[ideaStatusOf(row.status)] += 1;
  return counts;
}

async function readIdeaRow(ctx: SupabaseContext, wsId: string, ideaId: string): Promise<IdeaRow | null> {
  if (!isUuid(wsId) || !isUuid(ideaId)) return null;
  return unwrap(await ctx.db.from("ideas").select(IDEA_COLUMNS).eq("workspace_id", wsId).eq("id", ideaId).maybeSingle());
}

export async function getIdea(ctx: SupabaseContext, wsId: string, ideaId: string): Promise<Idea | null> {
  const row = await readIdeaRow(ctx, wsId, ideaId);
  return row ? (await hydrateIdeas(ctx, wsId, [row]))[0] : null;
}

export async function updateIdeaStatus(ctx: SupabaseContext, wsId: string, ideaId: string, status: IdeaStatus): Promise<Idea> {
  await requireWorkspace(ctx, wsId);
  if (!IDEA_STATUSES.includes(status)) throw new RepositoryError("invalid_input", `Bilinmeyen fikir durumu: ${String(status)}`);
  const current = await readIdeaRow(ctx, wsId, ideaId);
  if (!current) throw new RepositoryError("not_found", `Fikir bulunamadı: ${ideaId}`);
  if (current.status === status) return (await hydrateIdeas(ctx, wsId, [current]))[0];
  if (!canTransitionIdea(ideaStatusOf(current.status), status)) {
    throw new RepositoryError("invalid_state", `Fikir durumu ${current.status} → ${status} olamaz.`);
  }
  // İyimser eşzamanlılık: durum okunduğu andaki değerse yazılır (aksi halde başka biri değiştirmiştir).
  const updated = unwrap(
    await ctx.db.from("ideas").update({ status }).eq("workspace_id", wsId).eq("id", ideaId).eq("status", current.status).select(IDEA_COLUMNS).maybeSingle(),
  );
  if (!updated) throw new RepositoryError("invalid_state", "Fikir durumu bu sırada başka biri tarafından değiştirildi; yenile.");
  return (await hydrateIdeas(ctx, wsId, [updated]))[0];
}

/** Hook / taslak / senaryo değişikliği (SPN-35): kural ve birleştirme `applyIdeaRevision` (mock ile AYNI); jsonb'de bilinmeyen alanlar korunur. */
export async function reviseIdea(ctx: SupabaseContext, wsId: string, ideaId: string, input: unknown, now: Date): Promise<Idea> {
  await requireWorkspace(ctx, wsId);
  const value = parseIdeaRevision(input);
  const current = await readIdeaRow(ctx, wsId, ideaId);
  if (!current) throw new RepositoryError("not_found", `Fikir bulunamadı: ${ideaId}`);
  const idea = (await hydrateIdeas(ctx, wsId, [current]))[0];
  const parts = applyIdeaRevision(idea, value, now);
  const raw = typeof current.details === "object" && current.details !== null && !Array.isArray(current.details) ? current.details : {};
  const details = { ...raw, hookTypes: parts.details.hookTypes, revisions: parts.details.revisions, ...(parts.details.script === undefined ? {} : { script: parts.details.script }) };
  // İyimser eşzamanlılık: okunan sürüm hâlâ güncelse yazılır (başka biri araya girdiyse yenile).
  const updated = unwrap(
    await ctx.db
      .from("ideas")
      .update({ hooks: parts.hooks, script_outline: parts.scriptOutline, details: details as { [key: string]: Json | undefined } })
      .eq("workspace_id", wsId)
      .eq("id", ideaId)
      .eq("updated_at", current.updated_at)
      .select(IDEA_COLUMNS)
      .maybeSingle(),
  );
  if (!updated) throw new RepositoryError("invalid_state", "Fikir bu sırada başka biri tarafından değiştirildi; yenile.");
  return (await hydrateIdeas(ctx, wsId, [updated]))[0];
}
