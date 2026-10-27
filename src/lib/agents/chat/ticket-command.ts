/**
 * Sohbetten plan fikri seçme ve fiş yazma/değiştirme (`select_idea`, `write_ticket`, `update_ticket`; paket 28 G6). Model yalnız ÖNERİR; burada
 * sunucu doğrular: fikir bu çalışma alanında ve BU HAFTANIN planında mı (`workflow.ts`; uydurma / yabancı kimlik reddedilir), durum uygun mu.
 * Çalışma alanı bağlamdan gelir. İş mevcut sunucu işlevleridir (`createOrderForIdea`, `updateOrder`, depo `updateIdeaStatus`). Hata FIRLATILMAZ:
 * yanıta eklenecek tek düz Türkçe cümle döner (başarıda sonuç + `/fis/<id>` bağlantısı). Not metni günlüğe yazılmaz.
 * Karar: `write_ticket` seçilmemiş (`new`) fikri de `saved` yapar (fişi istemek seçmektir; `createOrderForIdea` yapar, sayfa düğmesiyle AYNI);
 * bırakılmış / yayınlanmış fikre fiş yazılmaz.
 */
import "server-only";

import type { FactsContext } from "@/lib/agents/analyst/facts";
import { CHAT_TICKET_TEXT as T, chatTicketHref } from "@/lib/agents/chat/messages";
import type { ChatOutput } from "@/lib/agents/chat/schema";
import { loadChatWorkflow } from "@/lib/agents/chat/workflow";
import { RepositoryError } from "@/lib/data/repository";
import type { IdeaStatus } from "@/lib/domain/intel";
import { createOrderForIdea, updateOrder } from "@/lib/studio-order/create-for-idea";

export interface TicketCommandContext extends FactsContext {
  /** Çalışma alanı slug'ı (fiş hesap kimliği için; yoksa @handle). */
  panelSlug?: string;
}

type Command = "select_idea" | "write_ticket" | "update_ticket";
type PlanIdea = { id: string; title: string; status: IdeaStatus };

async function selectIdea(ctx: FactsContext, idea: PlanIdea): Promise<string> {
  if (idea.status === "dismissed") return T.dismissed;
  if (idea.status === "published") return T.published;
  if (idea.status !== "new") return T.alreadySelected(idea.title);
  await ctx.repo.updateIdeaStatus(ctx.workspaceId, idea.id, "saved");
  return T.selected(idea.title);
}

export async function runChatTicketCommand(ctx: TicketCommandContext, command: Command, ticket: NonNullable<ChatOutput["ticket"]>, log?: (line: string) => void): Promise<string> {
  try {
    const workflow = await loadChatWorkflow(ctx);
    const idea = ticket.ideaId === undefined ? undefined : workflow.ideas.find((i) => i.id === ticket.ideaId);

    if (command === "update_ticket") {
      const order = ticket.orderId !== undefined ? workflow.tickets.find((t) => t.id === ticket.orderId) : workflow.tickets.find((t) => t.ideaId === ticket.ideaId);
      if (order === undefined) return ticket.orderId === undefined && idea === undefined ? T.notInPlan : T.noOrder;
      if (order.status !== "taslak") return T.notDraft;
      const updated = await updateOrder({ repo: ctx.repo, wsId: ctx.workspaceId, now: ctx.now, orderId: order.id, kind: ticket.kind, note: ticket.note });
      return T.updated(chatTicketHref(updated.id));
    }

    if (idea === undefined) return T.notInPlan;
    if (command === "select_idea") return await selectIdea(ctx, idea);

    if (idea.status === "dismissed") return T.dismissed;
    if (idea.status === "published") return T.published;
    const { order, created } = await createOrderForIdea({ repo: ctx.repo, wsId: ctx.workspaceId, now: ctx.now, ideaId: idea.id, kind: ticket.kind, note: ticket.note, panelSlug: ctx.panelSlug });
    return created ? T.written(idea.title, chatTicketHref(order.id)) : T.existing(idea.title, chatTicketHref(order.id));
  } catch (error) {
    log?.(`fiş komutu uygulanamadı: ${command}, ${error instanceof RepositoryError ? error.code : "hata"}`);
    return error instanceof RepositoryError && error.code === "invalid_state" ? T.notDraft : T.failed;
  }
}
