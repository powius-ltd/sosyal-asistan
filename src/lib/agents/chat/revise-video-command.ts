/**
 * Sohbetten video revizesi önerisi (`revise_video`, SPN-36 G5). Sohbet revize BAŞLATMAZ ve üretim açmaz: model fiş kimliği + notu ÖNERİR,
 * sunucu fişi `<workflow>.tickets`'ten ve kuraldan (`orderRevisionProblem`: üretilmiş, hak var, onay bekleyen yayın) doğrular, sonra notu
 * tek cümlede geri söyler ve Yayın sayfasındaki onay kartına yönlendirir (revizeyi kullanıcı oradaki düğmeyle ister).
 * Hata FIRLATILMAZ: yanıta eklenecek tek düz Türkçe cümle döner.
 */
import "server-only";

import type { FactsContext } from "@/lib/agents/analyst/facts";
import { CHAT_VIDEO_REVISION_TEXT as T } from "@/lib/agents/chat/messages";
import type { ChatOutput } from "@/lib/agents/chat/schema";
import { loadChatWorkflow } from "@/lib/agents/chat/workflow";
import { orderRevisionProblem, revisionsLeft } from "@/lib/domain/studio-order";

const PROBLEM_TEXT = { not_produced: T.notProduced, limit: T.limit, no_pending_publish: T.notPending } as const;

export async function runChatReviseVideoCommand(ctx: FactsContext, videoRevision: NonNullable<ChatOutput["videoRevision"]>, log?: (line: string) => void): Promise<string> {
  try {
    const workflow = await loadChatWorkflow(ctx);
    if (!workflow.tickets.some((ticket) => ticket.id === videoRevision.orderId)) return T.notFound;
    const order = await ctx.repo.getStudioOrder(ctx.workspaceId, videoRevision.orderId);
    if (!order) return T.notFound;
    const jobs = await ctx.repo.listPublishJobs(ctx.workspaceId, {});
    const open = jobs.find((job) => job.orderId === order.ticket.siparis_id && (job.status === "awaiting_approval" || job.status === "draft"));
    const problem = orderRevisionProblem(order, open?.status);
    if (problem !== undefined) return PROBLEM_TEXT[problem];
    return T.suggest(videoRevision.note, revisionsLeft(order));
  } catch {
    log?.("video revize önerisi doğrulanamadı");
    return T.failed;
  }
}
