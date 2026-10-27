/**
 * Mock depo: fiş (stüdyo siparişi). Supabase karşılığı `supabase/studio-orders.ts`; kurallar aynıdır (`studio-order-input.ts`): doğrulama,
 * fikir bu çalışma alanında olmalı, fikir başına tek etkin (`hata` dışı) fiş, yalnız `taslak` fişte tür / not değişir. Fişler depo örneğinin
 * kendi durumudur (tohum yok); fikir `state.ideas`'tan doğrulanır.
 */
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import type { MockContext } from "@/lib/data/mock/repos/context";
import { parseCreateStudioOrder, parseStudioOrderQuery, parseUpdateStudioOrder } from "@/lib/data/studio-order-input";
import { isActiveOrderStatus, type StudioOrder } from "@/lib/domain/studio-order";

export type StudioOrderMethods = Pick<PanelRepository, "createStudioOrder" | "getStudioOrder" | "listStudioOrders" | "updateStudioOrder">;

export function createStudioOrderMethods(ctx: MockContext): StudioOrderMethods {
  const { state, requireWs, out } = ctx;
  const orders: StudioOrder[] = [];
  const find = (wsId: string, id: string) => orders.find((o) => o.workspaceId === wsId && o.id === id);
  return {
    async createStudioOrder(wsId, input, now) {
      requireWs(wsId);
      const value = parseCreateStudioOrder(input);
      if (!state.ideas.some((i) => i.id === value.ideaId && i.workspaceId === wsId)) throw new RepositoryError("not_found", "Fikir bulunamadı.");
      if (orders.some((o) => o.workspaceId === wsId && o.ideaId === value.ideaId && isActiveOrderStatus(o.status))) {
        throw new RepositoryError("already_exists", "Bu fikir için zaten bir fiş var.");
      }
      const stamp = now.toISOString();
      const order: StudioOrder = {
        id: crypto.randomUUID(),
        workspaceId: wsId,
        ideaId: value.ideaId,
        weekStart: value.weekStart,
        slot: value.slot,
        ticket: structuredClone(value.ticket),
        note: value.note,
        status: value.ticket.durum,
        createdAt: stamp,
        updatedAt: stamp,
      };
      orders.push(order);
      return out(order);
    },
    async getStudioOrder(wsId, id) {
      requireWs(wsId);
      const order = find(wsId, id);
      return order === undefined ? undefined : out(order);
    },
    async listStudioOrders(wsId, query) {
      requireWs(wsId);
      const q = parseStudioOrderQuery(query);
      const ideaIds = q.ideaIds === undefined ? undefined : new Set(q.ideaIds);
      const list = orders
        .filter((o) => o.workspaceId === wsId && (ideaIds === undefined || ideaIds.has(o.ideaId)) && (q.weekStart === undefined || o.weekStart === q.weekStart))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      return out(list);
    },
    async updateStudioOrder(wsId, id, patch, now) {
      requireWs(wsId);
      const value = parseUpdateStudioOrder(patch);
      const order = find(wsId, id);
      if (order === undefined) throw new RepositoryError("not_found", "Fiş bulunamadı.");
      if (order.status !== "taslak") throw new RepositoryError("invalid_state", "Yalnız taslak fiş değiştirilebilir.");
      if (value.kind !== undefined) order.ticket = { ...order.ticket, tur: value.kind };
      if (value.note !== undefined) order.note = value.note;
      order.updatedAt = now.toISOString();
      return out(order);
    },
  };
}
