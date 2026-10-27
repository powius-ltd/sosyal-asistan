import type { PanelRepository } from "@/lib/data/repository";
import { isActiveOrderStatus } from "@/lib/domain/studio-order";

/**
 * Fikir kimliği → etkin fiş kimliği, TEK `listStudioOrders` okumasıyla (kart başına okuma yok). Fikir başına tek etkin fiş vardır
 * (`hata` dışı); fişi olmayan fikir haritada yoktur ve kart "Fiş hazırla" der. Fikir listesi boşsa depoya gidilmez.
 */
export async function loadActiveOrderIds(repo: PanelRepository, wsId: string, ideaIds: readonly string[]): Promise<Record<string, string>> {
  if (ideaIds.length === 0) return {};
  const orders = await repo.listStudioOrders(wsId, { ideaIds: [...ideaIds] });
  const map: Record<string, string> = {};
  for (const order of orders) if (isActiveOrderStatus(order.status) && !(order.ideaId in map)) map[order.ideaId] = order.id;
  return map;
}
