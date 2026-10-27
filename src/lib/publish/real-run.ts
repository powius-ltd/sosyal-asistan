/**
 * İşçinin çağırdığı iki giriş: `order_return` (fiş tara → onay bekleyen satır) ve `publish` (onaylı satırı zamanla / yayınlananı kapat).
 * Stüdyo çalışma alanı olmayan hesap için iş yapacak bir şey yoktur (`not_studio`). Zernio anahtarı yoksa HİÇBİR çağrı yapılmaz.
 */
import "server-only";

import type { IntelContext } from "@/lib/intel/context";
import { ordersRootOf } from "@/lib/publish/order-media";
import { returnOrders, type OrderReturnResult } from "@/lib/publish/order-return";
import { createOrderReturnStore, createPublishStore } from "@/lib/publish/real-stores";
import { runPublish, type RunPublishResult } from "@/lib/publish/run-publish";
import { createZernioProvider } from "@/lib/publish/zernio-provider";
import { listStudioPanelSlugs, studioAccountOf } from "@/lib/studio-order/accounts";
import { linkPublishedOrder } from "@/lib/studio-order/publish";
import { pickZernioKey } from "@/lib/zernio/api-key";
import { createZernioClient } from "@/lib/zernio/client";
import { createZernioPublishClient } from "@/lib/zernio/publish-client";

export type OrderReturnRun = { outcome: "not_studio" } | { outcome: "done"; result: OrderReturnResult };
export type PublishRun = { outcome: "not_studio" } | { outcome: "key_missing" } | { outcome: "done"; result: RunPublishResult };

const studioSlugOf = (ctx: IntelContext): string | undefined =>
  ctx.workspaceSlug !== undefined && listStudioPanelSlugs().includes(ctx.workspaceSlug) ? studioAccountOf(ctx.workspaceSlug).studioSlug : undefined;

export async function runOrderReturnReal(ctx: IntelContext, options: { env?: Readonly<Record<string, string | undefined>> } = {}): Promise<OrderReturnRun> {
  const studioSlug = studioSlugOf(ctx);
  if (!studioSlug) return { outcome: "not_studio" };
  return { outcome: "done", result: await returnOrders({ root: ordersRootOf(options.env), studioSlug, now: ctx.now, store: createOrderReturnStore(ctx) }) };
}

export async function runPublishReal(ctx: IntelContext, options: { env?: Readonly<Record<string, string | undefined>>; log: (line: string) => void }): Promise<PublishRun> {
  const studioSlug = studioSlugOf(ctx);
  if (!studioSlug) return { outcome: "not_studio" };
  const env = options.env ?? process.env;
  const key = pickZernioKey(ctx.workspaceSlug, env);
  if (!key) return { outcome: "key_missing" };
  const provider = createZernioProvider({ publish: createZernioPublishClient({ apiKey: key.apiKey }), read: createZernioClient({ apiKey: key.apiKey }) });
  const result = await runPublish({
    root: ordersRootOf(env), studioSlug, now: ctx.now, store: createPublishStore(ctx), provider, log: options.log,
    linkIdea: (ticket, url) => linkPublishedOrder(ctx.repo, ctx.workspaceId, ticket, url),
  });
  return { outcome: "done", result };
}
