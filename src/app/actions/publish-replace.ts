"use server";

/**
 * "Kopyala ve düzelt" / "Yeniden dene" (D2-01, D2-06): TEK action. Önce yeni iş oluşturulur; yalnız o başarılıysa eski iş iptal edilir.
 * Yeni iş oluşmazsa (doğrulama, uyum, hesap, depo hatası) eskisine dokunulmaz. Eski iş yalnız düzeltilebilir bir durumdaysa
 * (`fixModeOf`) kopyalanır; sunucu bunu kendisi okur (istemciye güvenilmez). Şema değişikliği yok: var olan `createPublishJob` +
 * `cancelPublishJob` depo çağrıları.
 */
import { revalidatePath } from "next/cache";

import { buildCreateJobInput } from "@/app/actions/publish-job-input";
import { REPLACE_HALF_DONE_MESSAGE } from "@/components/publish/publish-messages";
import { replacePublishJobSchema } from "@/components/publish/publish-schemas";
import { actionFail, actionOk, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { MAX_PAGE_LIMIT } from "@/lib/data/queries";
import { ROUTES } from "@/lib/routes";
import { FIX_STALE_MESSAGE, fixModeOf } from "@/lib/plain-language-publish";

/** `oldCancelled: false` = yeni iş kaydedildi ama eski iş iptal edilemedi (ekran uyarır). */
export async function replacePublishJob(input: unknown): Promise<ActionResult<{ oldCancelled: boolean }>> {
  const parsed = replacePublishJobSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { replacesJobId, job: values } = parsed.data;

  try {
    const context = await getPanelContext();
    const { repo, wsId } = context;

    // Yalnız düzeltilebilir durumdakiler okunur (200 işlik listenin dışında kalan eski iş de bulunur).
    const jobs = await repo.listPublishJobs(wsId, { status: ["draft", "awaiting_approval", "failed", "expired"], limit: MAX_PAGE_LIMIT });
    const old = jobs.find((job) => job.id === replacesJobId);
    if (!old || fixModeOf(old.status) === undefined) return actionFail(FIX_STALE_MESSAGE, "invalid_state");

    const built = await buildCreateJobInput(context, values, {
      ideaId: old.ideaId,
      ...(old.orderId === undefined ? {} : { orderId: old.orderId }),
      ...(old.mediaPath === undefined ? {} : { mediaPath: old.mediaPath }),
    });
    if (!built.ok) return built;

    // Yeni iş önce: hata fırlatırsa eskisine hiç dokunulmaz.
    let oldCancelled = true;
    try {
      await repo.createPublishJob(wsId, built.input);
    } catch (error) {
      // Aynı siparişin AKTİF (taslak / onay bekleyen) satırı yeni satırla çakışır (benzersiz indeks): doğrulamalar geçti, eski satır
      // iptal edilip yeni açılır. Başarısız / süresi dolmuş satır aktif değildir, bu yola düşmez.
      if (old.orderId === undefined || (error as { code?: unknown }).code !== "already_exists") throw error;
      await repo.cancelPublishJob(wsId, old.id);
      try {
        await repo.createPublishJob(wsId, built.input);
      } catch (secondError) {
        // Eski satır iptal edildi (geri alınamaz: iptal son durumdur) ama yenisi açılamadı: sessizce bırakılmaz, durum açıkça söylenir.
        console.error("[action] eski iş iptal edildi, yeni iş açılamadı", secondError);
        revalidatePath(ROUTES.publish);
        return actionFail(REPLACE_HALF_DONE_MESSAGE, "invalid_state");
      }
      revalidatePath(ROUTES.publish);
      return actionOk({ oldCancelled });
    }

    try {
      await repo.cancelPublishJob(wsId, old.id);
    } catch (error) {
      console.error("[action] eski yayın işi iptal edilemedi", error);
      oldCancelled = false;
    }
    revalidatePath(ROUTES.publish);
    return actionOk({ oldCancelled });
  } catch (error) {
    return toActionError(error);
  }
}
