/**
 * Giriş ekranının girdisi: haftalık akış (Bugün'ün okumasını yeniden kullanır, `loadWeeklyFlowInput`) + bu haftanın plan videoları
 * ve etkin fişleri. Plan bu haftanın değilse video listesi boştur (hat Plan'da durur). Yalnız `PanelRepository` OKUMA metotları.
 */
import type { PanelRepository } from "@/lib/data/repository";
import { isActiveOrderStatus } from "@/lib/domain/studio-order";
import type { EntryInput, EntryVideoInput } from "@/lib/entry/types";
import { readSafe } from "@/lib/overview/read-safe";
import type { TodayInput } from "@/lib/today/types";
import { deriveWeeklyFlow } from "@/lib/weekly-flow/derive";
import { loadWeeklyFlowInput } from "@/lib/weekly-flow/load";

export async function loadEntryInput(args: {
  repo: PanelRepository;
  wsId: string;
  now: Date;
  today: Pick<TodayInput, "summary" | "workspace">;
}): Promise<EntryInput> {
  const { repo, wsId, today } = args;
  const plan = today.summary.plan;
  const current = plan && plan.weekStart === today.summary.currentWeekStart ? plan : undefined;
  const items = current ? [...current.items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : [];
  const [flowInput, orders] = await Promise.all([
    loadWeeklyFlowInput(args),
    items.length > 0 ? readSafe("fişler", () => repo.listStudioOrders(wsId, { ideaIds: items.map((i) => i.ideaId) })) : undefined,
  ]);
  const videos: EntryVideoInput[] = items.map((item) => {
    const order = orders?.find((o) => o.ideaId === item.ideaId && isActiveOrderStatus(o.status));
    return {
      ideaId: item.ideaId,
      title: item.idea.title,
      rationale: item.idea.rationale,
      ideaStatus: item.idea.status,
      ...(item.slotAt ? { slotAt: item.slotAt } : {}),
      ...(order ? { order: { id: order.id, status: order.status, ...(order.ticket.tur ? { kind: order.ticket.tur } : {}) } } : {}),
    };
  });
  return { flow: deriveWeeklyFlow(flowInput), videos };
}
