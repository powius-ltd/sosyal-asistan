"use server";

/**
 * Stüdyo siparişinin üretim saatini yazar (fişin `uretim_saati` alanı; ekranı 12'de). Operatör modu gerekir (fiş dosyasına yazar, yalnız
 * yerelde anlamlıdır); action doğrudan POST edilebildiği için mod, girdi ve çalışma alanı → stüdyo hesabı eşlemesi sunucuda denetlenir.
 * Kural `lib/studio-order/production-time.ts`'tedir; burada yalnız kapı, doğrulama ve hata çevirisi.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionFail, actionOk, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { ordersRootOf } from "@/lib/publish/order-media";
import { ROUTES } from "@/lib/routes";
import { StudioAccountError, studioAccountOf } from "@/lib/studio-order/accounts";
import { ProductionTimeError, setOrderProductionTime } from "@/lib/studio-order/production-time";
import { isOperatorMode } from "@/lib/workspace/operator-mode";
import { listWorkspaces } from "@/lib/workspace/registry";

const OPERATOR_ONLY_MESSAGE = "Üretim saati yalnız yerel operatör modunda değiştirilir.";

const productionTimeSchema = z.strictObject({
  siparisId: z.string({ error: "Sipariş seç." }).trim().regex(/^[a-z0-9-]+$/, "Sipariş kimliği geçersiz.").max(120),
  stamp: z.string({ error: "Üretim saati gir." }).trim().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "Üretim saati 'YYYY-AA-GG SS:DD' biçiminde olmalı."),
});

export async function setOrderProductionTimeAction(input: unknown): Promise<ActionResult<{ stamp: string }>> {
  if (!isOperatorMode()) return actionFail(OPERATOR_ONLY_MESSAGE, "invalid_state");
  const parsed = productionTimeSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);

  try {
    const { wsId, now } = await getPanelContext();
    const workspace = (await listWorkspaces()).find((item) => item.id === wsId);
    const studio = studioAccountOf(workspace?.slug);
    setOrderProductionTime({ root: ordersRootOf(), studioSlug: studio.studioSlug, siparisId: parsed.data.siparisId, stamp: parsed.data.stamp, now });
    revalidatePath(ROUTES.publish);
    return actionOk({ stamp: parsed.data.stamp });
  } catch (error) {
    if (error instanceof ProductionTimeError) return actionFail(error.message, error.code);
    if (error instanceof StudioAccountError) return actionFail("Bu hesap stüdyoda tanımlı değil; üretim saati yazılamaz.", "invalid_state");
    return toActionError(error);
  }
}
