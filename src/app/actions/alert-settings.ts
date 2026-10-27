"use server";

/**
 * Uyarı ayarları (rakip/kendi tutan eşiği, haftalık özet zamanı, kanallar). Action doğrudan POST ile çağrılabildiği
 * için girdi sunucuda zod ile doğrulanır: `alert-settings-patch.ts` şeması KATIDIR (bilinmeyen alan reddedilir), bu
 * yüzden Telegram sohbet kimliği/anahtarı gibi sırlar ya da `chatIdSet` yamaya sokulamaz. Workspace istemciden
 * ALINMAZ, `getPanelContext()` çözer; çapraz kurallar (e-posta açıksa adres, Telegram açıksa sohbet bağlı) depoda.
 */
import { revalidatePath } from "next/cache";

import { ACTION_OK, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { alertSettingsPatchSchema } from "@/lib/data/alert-settings-patch";
import { getPanelContext } from "@/lib/data";
import { ROUTES } from "@/lib/routes";

export async function updateAlertSettingsAction(input: unknown): Promise<ActionResult> {
  const parsed = alertSettingsPatchSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Uyarı ayarları geçersiz.");

  try {
    const { repo, wsId } = await getPanelContext();
    await repo.updateAlertSettings(wsId, parsed.data);
    revalidatePath(ROUTES.settings);
    return ACTION_OK;
  } catch (error) {
    // Şema geçtikten sonra depodan dönen `invalid_input` yalnız e-posta çapraz kuralıdır.
    return toActionError(error, {
      invalid_input: "E-posta kanalını açmak için geçerli bir adres gir.",
      invalid_state: "Telegram sohbeti bağlı değil; kanalı açmadan önce sohbeti bağla.",
    });
  }
}
