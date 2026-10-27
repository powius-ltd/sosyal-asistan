"use server";

/**
 * Çalışma alanı hesap türü (İşletme / koç · İçerik üreticisi · Karma): kreatif matrisleri, açı etiketlemesini, CTA önerisini ve plan karmasını
 * belirler (`domain/account-type.ts`). Action doğrudan POST ile çağrılabildiği için girdi sunucuda, `updateWorkspace` yamasıyla AYNI şemayla
 * (`workspacePatchSchema`, yalnız `accountType` alanı) doğrulanır; çalışma alanı istemciden ALINMAZ. Tür kaldırılamaz (null geçersiz).
 */
import { revalidatePath } from "next/cache";

import { ACTION_OK, actionFail, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { workspacePatchSchema } from "@/lib/data/workspace-patch";
import { ROUTES } from "@/lib/routes";

const accountTypeSchema = workspacePatchSchema.pick({ accountType: true });

export async function updateAccountType(input: unknown): Promise<ActionResult> {
  const parsed = accountTypeSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { accountType } = parsed.data;
  // Yama alanı isteğe bağlıdır (undefined = dokunma); burada seçim zorunludur.
  if (accountType === undefined) return actionFail("Hesap türünü seç.");

  try {
    const { repo, wsId } = await getPanelContext();
    await repo.updateWorkspace(wsId, { accountType });
    // Tür ekranları (matris bölümleri, brifing, plan) ve ayarlar eskimesin.
    revalidatePath(ROUTES.settings);
    revalidatePath(ROUTES.anatomy);
    revalidatePath(ROUTES.overview, "layout");
    return ACTION_OK;
  } catch (error) {
    return toActionError(error);
  }
}
