/**
 * Sohbetin haftalık akış bilgisi (paket 28 G6): güncel planın (bu hafta ya da ileriki haftanın en yeni planı; Bugün şeridiyle aynı okuma) fikirleri (kimlik + başlık + durum) ve fişler (kimlik + fikir kimliği + tür + durum).
 * Model kimlikleri YALNIZ buradan kopyalar (`<workflow>` veri bloğu); komutu sunucu aynı veriyle yeniden doğrular (`ticket-command.ts`).
 * Yalnız OKUMA; okunamazsa boş döner (sohbet çökmez). Başlık veri bloğunda kaçırılır (`dataBlock`).
 */
import type { FactsContext } from "@/lib/agents/analyst/facts";
import type { IdeaStatus } from "@/lib/domain/intel";
import { isActiveOrderStatus } from "@/lib/domain/studio-order";
import { weekStartOf } from "@/lib/domain/weekly-plan";
import { toDayKey } from "@/lib/format";
import type { OrderStatus } from "@/lib/studio-order/schema";

export interface ChatWorkflow {
  weekStart?: string;
  ideas: { id: string; title: string; status: IdeaStatus }[];
  tickets: { id: string; ideaId: string; kind?: string; status: OrderStatus }[];
}

export async function loadChatWorkflow(ctx: FactsContext): Promise<ChatWorkflow> {
  const { repo, workspaceId, now } = ctx;
  try {
    const workspace = await repo.getWorkspace(workspaceId);
    const current = weekStartOf(toDayKey(now, workspace?.timezone) ?? "");
    // Plan çoğunlukla gelecek hafta için üretilir: bu haftadan eski olmayan en yeni plan; yoksa bu haftanınki.
    const latest = (await repo.listWeeklyPlans(workspaceId, { limit: 1 }))[0];
    const weekStart = latest !== undefined && current !== undefined && latest.weekStart >= current ? latest.weekStart : current;
    const plan = weekStart === undefined ? null : await repo.getWeeklyPlan(workspaceId, weekStart);
    const orders = await repo.listStudioOrders(workspaceId, {});
    return {
      ...(weekStart === undefined ? {} : { weekStart }),
      ideas: (plan?.items ?? []).filter((item) => item.position !== undefined).map((item) => ({ id: item.ideaId, title: item.idea.title, status: item.idea.status })),
      tickets: orders.filter((o) => isActiveOrderStatus(o.status)).map((o) => ({ id: o.id, ideaId: o.ideaId, ...(o.ticket.tur === undefined ? {} : { kind: o.ticket.tur }), status: o.status })),
    };
  } catch {
    return { ideas: [], tickets: [] };
  }
}
