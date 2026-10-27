"use server";

/**
 * Bildirim okundu işaretleme. Action'lar doğrudan POST ile çağrılabildiği için girdi sunucuda zod ile doğrulanır;
 * workspace istemciden ALINMAZ, `getPanelContext()` çözer. Depo hatası ortak yardımcıyla (`@/lib/actions/result`)
 * Türkçe mesaja çevrilir.
 *
 * Zil rozeti panel düzeninde (`(panel)/layout.tsx`) okunur: okunmamış sayısını değiştiren her action düzeni
 * (`revalidatePath("/", "layout")`) yeniden doğrular; yoksa rozet sayfa gezinmesinde eskimiş kalır.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionFail, actionOk, toActionError, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { ROUTES } from "@/lib/routes";

const markReadSchema = z.object({ id: z.string().trim().min(1).max(128) });

export type MarkNotificationReadResult = ActionResult<{ id: string }>;
export type MarkAllNotificationsReadResult = ActionResult<{ marked: number }>;

/** Zil rozeti (düzen) + bildirim listesi + Genel bakış kartı yenilenir. */
function revalidateNotificationViews(): void {
  revalidatePath(ROUTES.overview, "layout");
  revalidatePath(ROUTES.notifications);
}

/** Tek bildirimi okundu yapar (idempotent). */
export async function markNotificationReadAction(input: unknown): Promise<MarkNotificationReadResult> {
  const parsed = markReadSchema.safeParse(input);
  if (!parsed.success) return actionFail("Geçersiz istek: bildirim bilgisi hatalı.");

  try {
    const { repo, wsId } = await getPanelContext();
    const notification = await repo.markNotificationRead(wsId, parsed.data.id);
    revalidateNotificationViews();
    return actionOk({ id: notification.id });
  } catch (error) {
    const failure = toActionError(error, { not_found: "Bildirim bulunamadı; silinmiş olabilir. Sayfayı yenile." });
    // Ekran eskimiş olabilir: güncel listeyi göstermesi için yeniden çiz.
    if (failure.code === "not_found") revalidateNotificationViews();
    return failure;
  }
}

/** Tüm okunmamışları okundu yapar; yapılan sayıyı döndürür (0 geçerli). */
export async function markAllNotificationsReadAction(): Promise<MarkAllNotificationsReadResult> {
  try {
    const { repo, wsId } = await getPanelContext();
    const marked = await repo.markAllNotificationsRead(wsId);
    revalidateNotificationViews();
    return actionOk({ marked });
  } catch (error) {
    return toActionError(error);
  }
}
