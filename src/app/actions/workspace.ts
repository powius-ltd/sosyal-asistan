"use server";

/**
 * Çalışma alanı geçişi ve oluşturma (OPERATÖR MODU: giriş yok, yerel; bkz. `lib/workspace/operator-mode.ts`). Action'lar doğrudan POST ile
 * çağrılabildiği için ikisi de modu kendisi denetler: kapalı ortamda (Vercel ya da `OPERATOR_MODE` ≠ local) çerez YAZILMAZ, çalışma alanı
 * AÇILMAZ. Çerez yalnız kimlik taşır; geçiş kimliği kayıtta var mı diye doğrulanır, oluşturma girdisi sunucuda zod ile doğrulanır.
 * Üyelik/giriş gelince bu action'lar oturum kullanıcısının üyeliğini denetler.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ACTION_OK, actionFail, actionOk, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { ROUTES } from "@/lib/routes";
import { writeWorkspaceCookie } from "@/lib/workspace/cookie";
import { createWorkspaceSchema } from "@/lib/workspace/create-input";
import { isOperatorMode } from "@/lib/workspace/operator-mode";
import { createWorkspace, listWorkspaces } from "@/lib/workspace/registry";

const DISABLED_MESSAGE = "Çalışma alanı geçişi bu ortamda kapalı (yalnız yerel operatör modunda açık).";

const switchSchema = z.object({ workspaceId: z.string({ error: "Çalışma alanı seç." }).trim().min(1, "Çalışma alanı seç.").max(64) });

/** Veri bütün düzende okunur (ad, rozet, sayfalar): geçişten sonra tüm düzen yenilenir. */
function refreshPanel(): void {
  revalidatePath(ROUTES.overview, "layout");
}

export async function switchWorkspace(input: unknown): Promise<ActionResult> {
  if (!isOperatorMode()) return actionFail(DISABLED_MESSAGE, "invalid_state");
  const parsed = switchSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);

  try {
    const known = await listWorkspaces();
    const target = known.find((workspace) => workspace.id.toLowerCase() === parsed.data.workspaceId.toLowerCase());
    if (!target) return actionFail("Çalışma alanı bulunamadı. Sayfayı yenileyip tekrar dene.", "not_found");
    await writeWorkspaceCookie(target.id);
    refreshPanel();
    return ACTION_OK;
  } catch (error) {
    return toActionError(error);
  }
}

/** Yeni çalışma alanı açar ve ona geçer. Otomatik toplama BAŞLATMAZ (Apify parası kullanıcı onayına bağlı). */
export async function createWorkspaceAndSwitch(input: unknown): Promise<ActionResult<{ workspaceId: string; name: string; slug?: string }>> {
  if (!isOperatorMode()) return actionFail(DISABLED_MESSAGE, "invalid_state");
  const parsed = createWorkspaceSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);

  try {
    const created = await createWorkspace(parsed.data);
    await writeWorkspaceCookie(created.id);
    refreshPanel();
    return actionOk({ workspaceId: created.id, name: created.name, slug: created.slug });
  } catch (error) {
    return toActionError(error, { not_implemented: "Örnek (mock) veri kaynağında çalışma alanı oluşturulamaz." });
  }
}
