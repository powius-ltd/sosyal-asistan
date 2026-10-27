"use server";

/**
 * Workspace uyum bölgesi (TR / US / TR_US): yayın açıklamalarının hangi ülke kurallarına göre denetlendiği.
 * Action doğrudan POST ile çağrılabildiği için girdi sunucuda, `updateWorkspace` yamasıyla AYNI şemayla
 * (`workspacePatchSchema`, yalnız `complianceRegion` alanı) doğrulanır; workspace istemciden ALINMAZ.
 */
import { revalidatePath } from "next/cache";

import { ACTION_OK, actionFail, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { workspacePatchSchema } from "@/lib/data/workspace-patch";
import { ROUTES } from "@/lib/routes";

const complianceRegionSchema = workspacePatchSchema.pick({ complianceRegion: true });

export async function updateComplianceRegion(input: unknown): Promise<ActionResult> {
  const parsed = complianceRegionSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { complianceRegion } = parsed.data;
  // Yama alanı isteğe bağlıdır (tavan/niş formu ayrı); burada seçim zorunludur.
  if (complianceRegion === undefined) return actionFail("Uyum bölgesi seç.");

  try {
    const { repo, wsId } = await getPanelContext();
    await repo.updateWorkspace(wsId, { complianceRegion });
    // Bölge Ayarlar'da görünür; Yayın ekranı denetimi (kart noktası, panel, dialog) bu bölgeye göre kurar.
    revalidatePath(ROUTES.settings);
    revalidatePath(ROUTES.publish);
    return ACTION_OK;
  } catch (error) {
    return toActionError(error);
  }
}
