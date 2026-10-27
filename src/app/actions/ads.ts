"use server";

/**
 * Reklam hedefi (yalnız yönetici modu): hesap başına "sonuç ne, kaça gelmeli". Action doğrudan POST ile çağrılabildiği için operatör kapısı,
 * zod doğrulaması ve çalışma alanı çözümü sunucuda yapılır; çalışma alanı istemciden ALINMAZ. Yazım yalnız panelin kendi hedef sütunlarına
 * gider (`updateAdAccountGoal`): reklam hesabına (Zernio / Meta) hiçbir şey yazılmaz.
 */
import { revalidatePath } from "next/cache";

import { ACTION_OK, actionFail, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { adGoalPatchSchema } from "@/lib/data/ad-schema";
import { ROUTES } from "@/lib/routes";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

const DISABLED_MESSAGE = "Reklam hedefi bu ortamda kapalı (yalnız yönetici modunda açık).";

export async function updateAdGoalAction(input: unknown): Promise<ActionResult> {
  if (!isOperatorMode()) return actionFail(DISABLED_MESSAGE, "invalid_state");
  const parsed = adGoalPatchSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);

  try {
    const { repo, wsId } = await getPanelContext();
    await repo.updateAdAccountGoal(wsId, parsed.data);
    // Kararlar hedefe bağlı: liste ve ayrıntı sayfaları eskimesin.
    revalidatePath(ROUTES.ads, "layout");
    return ACTION_OK;
  } catch (error) {
    return toActionError(error, { not_found: "Reklam hesabı bulunamadı. Sayfayı yenileyip tekrar dene." });
  }
}
