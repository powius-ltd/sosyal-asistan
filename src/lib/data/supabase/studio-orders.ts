/**
 * Supabase deposu: fiş (stüdyo siparişi, `studio_orders` 0032). Kurallar mock ile aynıdır (`mock/repos/studio-orders.ts`,
 * `studio-order-input.ts`). Tekillik (fikir başına tek etkin fiş) ve fikir ↔ çalışma alanı tutarlılığı DB'dedir; burada önce açık kontrol
 * yapılır, yarışta DB hatası aynı koda çevrilir (`23505` → `already_exists`, `23503` → `not_found`). Fişte yalnız `taslak` iken `tur` ve
 * not değişir; yazım `status = 'taslak'` koşuluyla yapılır (okuma ile yazma arasında stüdyo durumu ilerlettiyse 0 satır → `invalid_state`).
 */
import { advanceStudioOrderProblem, applyAdvance, parseAdvanceStudioOrder, parseCreateStudioOrder, parseStudioOrderQuery, parseUpdateStudioOrder, type AdvanceStudioOrderInput, type CreateStudioOrderInput, type StudioOrderQuery, type UpdateStudioOrderInput } from "@/lib/data/studio-order-input";
import { RepositoryError } from "@/lib/data/repository";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { isUuid, onlyUuids, unwrap } from "@/lib/data/supabase/errors";
import { iso, opt } from "@/lib/data/supabase/mappers/common";
import { requireWorkspace } from "@/lib/data/supabase/workspace";
import type { StudioOrder } from "@/lib/domain/studio-order";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { ORDER_STATUSES, ticketSchema, type OrderStatus, type Ticket } from "@/lib/studio-order/schema";

const COLUMNS = "id, workspace_id, idea_id, week_start, slot, ticket, note, status, created_at, updated_at" as const;
type Row = Pick<Tables<"studio_orders">, "id" | "workspace_id" | "idea_id" | "week_start" | "slot" | "ticket" | "note" | "status" | "created_at" | "updated_at">;

/** Satır → `StudioOrder`. Bozuk jsonb ya da durum şema ile DB'nin ayrıştığını gösterir: sessizce gizlenmez. */
function toStudioOrder(row: Row): StudioOrder {
  const ticket = ticketSchema.safeParse(row.ticket);
  const status = ORDER_STATUSES.find((s) => s === row.status);
  if (!ticket.success || status === undefined) throw new Error(`studio_orders satırı eşlenemedi: ${row.id}`);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ideaId: row.idea_id,
    weekStart: opt(row.week_start),
    slot: opt(row.slot),
    ticket: ticket.data,
    note: row.note,
    status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** Fişi JSON'a çevirir (tanımsız alanlar düşer). */
function ticketJson(ticket: Ticket): NonNullable<Json> {
  return JSON.parse(JSON.stringify(ticket)) as NonNullable<Json>;
}

export async function createStudioOrder(ctx: SupabaseContext, wsId: string, input: CreateStudioOrderInput, now: Date): Promise<StudioOrder> {
  await requireWorkspace(ctx, wsId);
  const value = parseCreateStudioOrder(input);
  if (!isUuid(value.ideaId)) throw new RepositoryError("not_found", "Fikir bulunamadı.");
  const idea = unwrap(await ctx.db.from("ideas").select("id").eq("workspace_id", wsId).eq("id", value.ideaId).maybeSingle());
  if (idea === null) throw new RepositoryError("not_found", "Fikir bulunamadı.");
  const active = unwrap(await ctx.db.from("studio_orders").select("id").eq("workspace_id", wsId).eq("idea_id", value.ideaId).neq("status", "hata").limit(1));
  if (active.length > 0) throw new RepositoryError("already_exists", "Bu fikir için zaten bir fiş var.");
  const stamp = now.toISOString();
  const row = unwrap(
    await ctx.db
      .from("studio_orders")
      .insert({
        workspace_id: wsId,
        idea_id: value.ideaId,
        week_start: value.weekStart ?? null,
        slot: value.slot ?? null,
        ticket: ticketJson(value.ticket),
        note: value.note,
        status: value.ticket.durum,
        created_at: stamp,
        updated_at: stamp,
      })
      .select(COLUMNS)
      .single(),
  );
  return toStudioOrder(row);
}

export async function getStudioOrder(ctx: SupabaseContext, wsId: string, id: string): Promise<StudioOrder | undefined> {
  await requireWorkspace(ctx, wsId);
  if (!isUuid(id)) return undefined;
  const row = unwrap(await ctx.db.from("studio_orders").select(COLUMNS).eq("workspace_id", wsId).eq("id", id).maybeSingle());
  return row === null ? undefined : toStudioOrder(row);
}

export async function listStudioOrders(ctx: SupabaseContext, wsId: string, query?: StudioOrderQuery): Promise<StudioOrder[]> {
  await requireWorkspace(ctx, wsId);
  const q = parseStudioOrderQuery(query);
  let builder = ctx.db.from("studio_orders").select(COLUMNS).eq("workspace_id", wsId);
  if (q.ideaIds !== undefined) {
    const ids = onlyUuids(q.ideaIds);
    if (ids.length === 0) return [];
    builder = builder.in("idea_id", ids);
  }
  if (q.weekStart !== undefined) builder = builder.eq("week_start", q.weekStart);
  const rows = unwrap(await builder.order("created_at", { ascending: false }).order("id", { ascending: false }));
  return rows.map(toStudioOrder);
}

export async function updateStudioOrder(ctx: SupabaseContext, wsId: string, id: string, patch: UpdateStudioOrderInput, now: Date): Promise<StudioOrder> {
  await requireWorkspace(ctx, wsId);
  const value = parseUpdateStudioOrder(patch);
  const current = await getStudioOrder(ctx, wsId, id);
  if (current === undefined) throw new RepositoryError("not_found", "Fiş bulunamadı.");
  if (current.status !== "taslak") throw new RepositoryError("invalid_state", "Yalnız taslak fiş değiştirilebilir.");
  if (value.ticket !== undefined && (value.ticket.fikir_id !== undefined && value.ticket.fikir_id !== current.ideaId)) throw new RepositoryError("invalid_input", "Fişteki fikir kimliği fişin fikriyle aynı olmalı.");
  const base = value.ticket ?? current.ticket;
  const ticket: Ticket = value.kind === undefined ? base : { ...base, tur: value.kind };
  void now; // updated_at'i DB tetikleyicisi yazar.
  const rows = unwrap(
    await ctx.db
      .from("studio_orders")
      .update({ ticket: ticketJson(ticket), note: value.note ?? current.note })
      .eq("workspace_id", wsId)
      .eq("id", id)
      .eq("status", "taslak" satisfies OrderStatus)
      .select(COLUMNS),
  );
  if (rows.length === 0) throw new RepositoryError("invalid_state", "Yalnız taslak fiş değiştirilebilir.");
  return toStudioOrder(rows[0]);
}

/** SPN-33: durum ilerletme. Yazım okunan durum koşuluyla yapılır (araya giren değişiklikte 0 satır → durum yeniden okunur, aynıysa boşa gider). */
export async function advanceStudioOrder(ctx: SupabaseContext, wsId: string, id: string, patch: AdvanceStudioOrderInput, now: Date): Promise<StudioOrder> {
  await requireWorkspace(ctx, wsId);
  const value = parseAdvanceStudioOrder(patch);
  const current = await getStudioOrder(ctx, wsId, id);
  if (current === undefined) throw new RepositoryError("not_found", "Fiş bulunamadı.");
  const problem = advanceStudioOrderProblem(current.status, value.status);
  if (problem !== undefined) throw new RepositoryError("invalid_state", problem);
  if (current.status === value.status) return current;
  void now; // updated_at'i DB tetikleyicisi yazar.
  const rows = unwrap(
    await ctx.db
      .from("studio_orders")
      .update({ ticket: ticketJson(applyAdvance(current.ticket, value)), status: value.status })
      .eq("workspace_id", wsId)
      .eq("id", id)
      .eq("status", current.status)
      .select(COLUMNS),
  );
  if (rows.length > 0) return toStudioOrder(rows[0]);
  const again = await getStudioOrder(ctx, wsId, id);
  if (again?.status === value.status) return again;
  throw new RepositoryError("invalid_state", "Fişin durumu bu arada değişti.");
}
