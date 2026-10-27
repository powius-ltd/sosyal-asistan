"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionFail, actionOk, toActionError, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { IDEA_STATUSES, type IdeaStatus } from "@/lib/domain/intel";
import { ROUTES } from "@/lib/routes";

const inputSchema = z.object({
  ideaId: z.string().trim().min(1).max(128),
  status: z.enum(IDEA_STATUSES),
});

export type UpdateIdeaStatusResult = ActionResult<{ ideaId: string; status: IdeaStatus }>;

/**
 * Fikir durumunu değiştirir. Server action'lar doğrudan POST ile çağrılabildiği için girdi sunucuda
 * zod ile doğrulanır; workspace istemciden değil `getPanelContext()`'ten gelir (Faz 1'de oturumdaki
 * üyelikten çözülür ve üyelik yoksa orada fırlatır). Geçiş kuralını (`canTransitionIdea`) depo uygular:
 * izin verilmeyen geçiş `invalid_state` olur ve Türkçe mesaja çevrilir.
 */
export async function updateIdeaStatusAction(input: unknown): Promise<UpdateIdeaStatusResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return actionFail("Geçersiz istek: fikir ya da durum bilgisi hatalı.");

  const { ideaId, status } = parsed.data;
  try {
    const { repo, wsId } = await getPanelContext();
    const idea = await repo.updateIdeaStatus(wsId, ideaId, status);
    revalidatePath(ROUTES.ideas);
    revalidatePath(ROUTES.overview);
    return actionOk({ ideaId: idea.id, status: idea.status });
  } catch (error) {
    const failure = toActionError(error, {
      not_found: "Fikir bulunamadı; silinmiş olabilir. Sayfayı yenileyin.",
      invalid_state: "Bu durum geçişine izin verilmiyor. Güncel durum yüklendi.",
    });
    // Ekran eskimiş olabilir: güncel durumu göstermesi için yeniden çiz.
    if (failure.code === "invalid_state" || failure.code === "not_found") revalidatePath(ROUTES.ideas);
    return failure;
  }
}
