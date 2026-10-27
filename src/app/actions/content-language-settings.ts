"use server";

/**
 * Çalışma alanı içerik dili (Türkçe / İngilizce / Otomatik): hook, script ve açıklama taslağının hangi dilde üretileceği.
 * Action doğrudan POST ile çağrılabildiği için girdi sunucuda, `updateWorkspace` yamasıyla AYNI şemayla (`workspacePatchSchema`,
 * yalnız `contentLanguage` alanı) doğrulanır; çalışma alanı istemciden ALINMAZ. `null` = Otomatik (ayarı kaldırır).
 */
import { revalidatePath } from "next/cache";

import { ACTION_OK, actionFail, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { workspacePatchSchema } from "@/lib/data/workspace-patch";
import { ROUTES } from "@/lib/routes";

const contentLanguageSchema = workspacePatchSchema.pick({ contentLanguage: true });

export async function updateContentLanguage(input: unknown): Promise<ActionResult> {
  const parsed = contentLanguageSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { contentLanguage } = parsed.data;
  // Yama alanı isteğe bağlıdır (undefined = dokunma); burada seçim zorunludur (Otomatik = null).
  if (contentLanguage === undefined) return actionFail("İçerik dilini seç.");

  try {
    const { repo, wsId } = await getPanelContext();
    await repo.updateWorkspace(wsId, { contentLanguage });
    revalidatePath(ROUTES.settings);
    return ACTION_OK;
  } catch (error) {
    return toActionError(error);
  }
}
