"use server";

/**
 * Fiş (stüdyo siparişi) action'ları: fikirden fiş üret, taslak fişin türünü / notunu değiştir. İş `lib/studio-order/create-for-idea.ts`'tedir
 * (sohbet de aynısını çağırır); burada yalnız girdi doğrulama, çalışma alanı bağlamı ve hata çevirisi. Action doğrudan POST edilebilir:
 * çalışma alanı gövdeden değil `getPanelContext()`'ten gelir.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionOk, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { STUDIO_ORDER_NOTE_MAX } from "@/lib/data/studio-order-input";
import { ROUTES } from "@/lib/routes";
import { createOrderForIdea, updateOrder } from "@/lib/studio-order/create-for-idea";
import { ORDER_KINDS } from "@/lib/studio-order/schema";
import { listWorkspaces } from "@/lib/workspace/registry";

const createSchema = z.object({
  ideaId: z.string({ error: "Fikir seç." }).trim().min(1, "Fikir seç.").max(128),
  /** Giriş ekranındaki karar ("Ben çekerim" / "Siz yapın"): fiş bu türle yazılır; fiş zaten varsa ve taslaksa türü değişir. */
  kind: z.enum(ORDER_KINDS, { error: "Bilinmeyen üretim türü." }).optional(),
});

const updateSchema = z
  .strictObject({
    orderId: z.string({ error: "Fiş seç." }).trim().min(1, "Fiş seç.").max(128),
    kind: z.enum(ORDER_KINDS, { error: "Bilinmeyen üretim türü." }).optional(),
    note: z.string({ error: "Not metin olmalı." }).trim().max(STUDIO_ORDER_NOTE_MAX, `Not en fazla ${STUDIO_ORDER_NOTE_MAX} karakter olabilir.`).optional(),
  })
  .refine((v) => v.kind !== undefined || v.note !== undefined, { message: "Değiştirilecek bir alan ver." });

const NOT_FOUND = { not_found: "Fikir ya da fiş bulunamadı; silinmiş olabilir. Sayfayı yenile." };

function refresh(): void {
  revalidatePath(ROUTES.ideas);
  revalidatePath(ROUTES.publish);
  revalidatePath(ROUTES.overview, "layout");
}

export async function createStudioOrderAction(input: unknown): Promise<ActionResult<{ orderId: string; created: boolean }>> {
  const parsed = createSchema.safeParse(typeof input === "string" ? { ideaId: input } : input);
  if (!parsed.success) return validationFail(parsed.error);
  try {
    const { repo, wsId, now } = await getPanelContext();
    const panelSlug = (await listWorkspaces()).find((w) => w.id === wsId)?.slug;
    const { kind } = parsed.data;
    const result = await createOrderForIdea({ repo, wsId, now, ideaId: parsed.data.ideaId, panelSlug, ...(kind ? { kind } : {}) });
    const { created } = result;
    const order = !created && kind && result.order.ticket.tur !== kind ? await updateOrder({ repo, wsId, now, orderId: result.order.id, kind }) : result.order;
    refresh();
    return actionOk({ orderId: order.id, created });
  } catch (error) {
    return toActionError(error, { ...NOT_FOUND, invalid_state: "Bu videonun üretimi başladı; kararı artık Asistan'a söyle." });
  }
}

export async function updateStudioOrderAction(input: unknown): Promise<ActionResult<{ orderId: string }>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  try {
    const { repo, wsId, now } = await getPanelContext();
    const order = await updateOrder({ repo, wsId, now, orderId: parsed.data.orderId, kind: parsed.data.kind, note: parsed.data.note });
    refresh();
    return actionOk({ orderId: order.id });
  } catch (error) {
    return toActionError(error, { ...NOT_FOUND, invalid_state: "Fiş artık taslak değil; değiştirilemez." });
  }
}
