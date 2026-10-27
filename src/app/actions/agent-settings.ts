"use server";

/**
 * Yönetici ajan ayarları (aylık ajan tavanı, toplama sıklığı, video sayısı, hedef rakip): Ayarlar'daki tek kart. Tavanı vermek ONAYDIR (depo onay
 * anını ve onaylayanı aynı anda yazar). Para yetkisi olduğundan YALNIZ yönetici modunda değişir; action doğrudan POST edilebildiği için mod
 * sunucuda denetlenir. Girdi `workspacePatchSchema` ile AYNI sınırlarla doğrulanır (DB CHECK'leriyle birebir); çalışma alanı istemciden ALINMAZ.
 */
import { revalidatePath } from "next/cache";

import { ACTION_OK, actionFail, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { workspacePatchSchema } from "@/lib/data/workspace-patch";
import { ROUTES } from "@/lib/routes";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

/** Dört alan da ZORUNLU: kart hepsini birlikte gönderir (kısmi yama başka yoldan yapılmaz). */
const agentSettingsSchema = workspacePatchSchema.pick({ agentMonthlyCapUsd: true, collectEveryDays: true, collectVideoLimit: true, rivalTarget: true }).required();

export async function updateAgentSettings(input: unknown): Promise<ActionResult> {
  const parsed = agentSettingsSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Ajan ayarları geçersiz.");
  if (!isOperatorMode()) return actionFail("Ajan ayarları yalnız yönetici modunda değiştirilebilir.", "invalid_state");
  try {
    const { repo, wsId } = await getPanelContext();
    await repo.updateWorkspace(wsId, parsed.data);
    revalidatePath(ROUTES.settings);
    revalidatePath(ROUTES.overview, "layout");
    return ACTION_OK;
  } catch (error) {
    return toActionError(error);
  }
}
