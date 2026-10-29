/**
 * `order_return` ve `publish` işlerinin gerçek bağlaması: service-role `AdminClient` + `PanelRepository`. Yalnız burada DB'ye yazılır;
 * kurallar (kök denetimi, tek gönderim, onay tazeliği) `order-return.ts` / `run-publish.ts`'tedir. Yazımlar koşulludur (`eq("status", …)`):
 * 0 satır etkilendiyse işlem YAPILMAMIŞ sayılır.
 */
import "server-only";

import { RepositoryError } from "@/lib/data/repository";
import type { IntelContext } from "@/lib/intel/context";
import { insertCycleNotice } from "@/lib/cycle/notify";
import { ORDER_MEDIA_PREFIX } from "@/lib/order-media-path";
import { handledOrderIds, isOrderPublishRow, ORDER_PUBLISH_STATUSES, pickOrderAccountId } from "@/lib/publish/order-rows";
import type { OrderReturnStore } from "@/lib/publish/order-return";
import { workspaceHasZernioKey } from "@/lib/publish/publishable";
import type { OrderPublishRow, PublishFailure, PublishStore } from "@/lib/publish/run-publish";

export function createOrderReturnStore(ctx: IntelContext): OrderReturnStore {
  return {
    async hasJobForOrder(orderId) {
      const { data, error } = await ctx.client.from("publish_jobs").select("order_id, status, created_at").eq("workspace_id", ctx.workspaceId).eq("order_id", orderId);
      if (error) throw new Error(`Yayın satırı okunamadı: ${error.message}`);
      return handledOrderIds(data ?? []).has(orderId);
    },
    async findAccountId() {
      const keyed = workspaceHasZernioKey(ctx.workspaceSlug);
      const accounts = await ctx.repo.listOwnAccounts(ctx.workspaceId);
      return pickOrderAccountId(accounts, keyed);
    },
    async ideaCaption(ideaId) {
      const idea = await ctx.repo.getIdea(ctx.workspaceId, ideaId);
      return idea ? { ...(idea.details.captionDraft ? { caption: idea.details.captionDraft } : {}) } : undefined;
    },
    async createJob(input) {
      await ctx.repo.createPublishJob(ctx.workspaceId, input);
    },
    notify: (draft) => insertCycleNotice(ctx.client, ctx.workspaceId, draft),
    async markPanelOrder(update) {
      const order = (await ctx.repo.listStudioOrders(ctx.workspaceId)).find((o) => o.ticket.siparis_id === update.orderId);
      if (order === undefined) return; // panelde karşılığı yok (elle yazılmış fiş)
      const patch = update.status === "uretildi" ? { status: "uretildi" as const, video: update.video, ...(update.cover !== undefined ? { cover: update.cover } : {}) } : { status: "hata" as const, errorNote: update.errorNote };
      try {
        await ctx.repo.advanceStudioOrder(ctx.workspaceId, order.id, patch, ctx.now);
      } catch (error) {
        // Paylaşılmış / başka durumdaki fiş geri çekilmez; yalnız geçiş kuralı reddi sessizce geçilir.
        if (!(error instanceof RepositoryError && error.code === "invalid_state")) throw error;
      }
    },
  };
}

export function createPublishStore(ctx: IntelContext): PublishStore {
  const jobs = () => ctx.client.from("publish_jobs");
  async function update(id: string, fromStatus: string | readonly string[], patch: Record<string, unknown>): Promise<boolean> {
    const statuses = typeof fromStatus === "string" ? [fromStatus] : [...fromStatus];
    const { data, error } = await jobs().update(patch as never).eq("workspace_id", ctx.workspaceId).eq("id", id).in("status", statuses).select("id");
    if (error) throw new Error(`Yayın satırı yazılamadı: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }

  return {
    async listRows() {
      const { data, error } = await jobs()
        .select("id, order_id, status, caption, media_path, scheduled_at, approved_at, container_id, social_account_id")
        .eq("workspace_id", ctx.workspaceId)
        .not("order_id", "is", null)
        .like("media_path", `${ORDER_MEDIA_PREFIX}%`)
        .in("status", [...ORDER_PUBLISH_STATUSES])
        .order("created_at", { ascending: true });
      if (error) throw new Error(`Yayın satırları okunamadı: ${error.message}`);
      const accounts = await ctx.repo.listOwnAccounts(ctx.workspaceId);
      const handles = new Map(accounts.map((a) => [a.id, a.handle] as const));
      const rows: OrderPublishRow[] = [];
      for (const r of data ?? []) {
        const handle = handles.get(r.social_account_id);
        if (!isOrderPublishRow(r, handles) || !r.order_id || !r.media_path || !handle || (r.status !== "approved" && r.status !== "publishing" && r.status !== "ready")) continue;
        rows.push({
          id: r.id, orderId: r.order_id, status: r.status, caption: r.caption ?? "", mediaPath: r.media_path, accountHandle: handle,
          ...(r.scheduled_at ? { scheduledFor: new Date(r.scheduled_at).toISOString() } : {}),
          ...(r.approved_at ? { approvedAt: new Date(r.approved_at).toISOString() } : {}),
          ...(r.container_id ? { containerId: r.container_id } : {}),
        });
      }
      return rows;
    },
    claim: (id) => update(id, "approved", { status: "publishing" }),
    async markReady(id, postId) {
      await update(id, "publishing", { status: "ready", container_id: postId });
    },
    async savePostId(id, postId) {
      await update(id, "publishing", { container_id: postId });
    },
    async markPublished(id, input) {
      await update(id, "ready", { status: "published", published_at: input.publishedAt, ...(input.permalink ? { published_permalink: input.permalink } : {}) });
    },
    async markFailed(id, code: PublishFailure, message) {
      await update(id, ["approved", "publishing", "ready"], { status: "failed", last_error: `${code}: ${message}`.slice(0, 500) });
    },
    notify: (draft) => insertCycleNotice(ctx.client, ctx.workspaceId, draft),
  };
}
