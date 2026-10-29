"use server";

/**
 * Haftalık plan action'ı: "Planı onayla" (SPN-35). Onay planın fikirlerini seçer; para harcamaz, üretim başlatmaz (üretim fişte ayrı düğme).
 * Onayı yalnız ekrandaki düğme verir (sohbet vermez). Action doğrudan POST edilebilir: çalışma alanı ve saat `getPanelContext()`'ten gelir,
 * hafta zod ile doğrulanır; kural (yalnız hazır plan, onay değişmez) depodadır.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionOk, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { ROUTES } from "@/lib/routes";

const approveSchema = z.strictObject({
  weekStart: z.string({ error: "Hafta seç." }).trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Hafta biçimi geçersiz."),
});

export async function approveWeeklyPlanAction(input: unknown): Promise<ActionResult<{ approvedAt: string }>> {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  try {
    const { repo, wsId, now } = await getPanelContext();
    const plan = await repo.approveWeeklyPlan(wsId, parsed.data.weekStart, now);
    revalidatePath(ROUTES.thisWeek);
    revalidatePath(ROUTES.ideas);
    revalidatePath(ROUTES.overview, "layout");
    return actionOk({ approvedAt: plan.approvedAt ?? now.toISOString() });
  } catch (error) {
    return toActionError(error, {
      not_found: "Bu hafta için plan bulunamadı. Sayfayı yenile.",
      invalid_state: "Bu plan henüz hazır değil; hazır olunca onaylayabilirsin.",
    });
  }
}
