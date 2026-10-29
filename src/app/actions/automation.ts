"use server";

/**
 * Otomatik işleri aç/kapat (`/otomatik`). Müşteri kendi kopyasında açıp kapatabilir: yönetici modu kapısı YOK; yalnız barındırılan
 * ortamda (`VERCEL`) kapalıdır. Action doğrudan POST edilebildiği için girdi sunucuda katı şemayla doğrulanır; çalışma alanı istemciden
 * ALINMAZ. Para kapısı burada değişmez: anahtar yalnız halkanın işi AÇIP AÇMAYACAĞINI söyler, harcama tavanı/onayı ayrı denetlenir.
 */
import { revalidatePath } from "next/cache";
import { ROUTES } from "@/lib/routes";
import { z } from "zod";

import { ACTION_OK, actionFail, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { AUTOMATION_KEYS, AUTOMATION_PATCH_FIELD, AUTOMATION_PRODUCE_READY } from "@/lib/automation/flags";
import { getPanelContext } from "@/lib/data";

const automationInputSchema = z.strictObject({
  key: z.enum(AUTOMATION_KEYS, { error: "Bilinmeyen otomatik iş." }),
  enabled: z.boolean({ error: "Açık ya da kapalı olmalı." }),
});

export async function setAutomationAction(input: unknown): Promise<ActionResult> {
  const parsed = automationInputSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Otomatik iş ayarı geçersiz.");
  if (process.env.VERCEL?.trim()) return actionFail("Bu ortamda ayarlar değiştirilemez.", "invalid_state");
  const { key, enabled } = parsed.data;
  if (key === "produce" && !AUTOMATION_PRODUCE_READY) return actionFail("Otomatik üretim henüz hazır değil.", "invalid_state");
  try {
    const { repo, wsId } = await getPanelContext();
    await repo.updateWorkspace(wsId, { [AUTOMATION_PATCH_FIELD[key]]: enabled });
    revalidatePath(ROUTES.automation);
    revalidatePath("/", "layout");
    return ACTION_OK;
  } catch (error) {
    return toActionError(error);
  }
}
