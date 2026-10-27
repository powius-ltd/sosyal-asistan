"use server";

/**
 * Yayın işi mutasyonları. Action'lar doğrudan POST ile çağrılabildiği için:
 *  - girdi zod ile sunucuda doğrulanır,
 *  - workspace/oturum `getPanelContext()` ile çözülür (Faz 1'de oturumsuzsa orada fırlar),
 *  - durum makinesi kuralı (yalnız `draft` onaya gönderilir, yalnız `awaiting_approval` onaylanır) repository'de uygulanır;
 *    `invalid_state` kullanıcıya Türkçe mesajla döner.
 */
import { revalidatePath } from "next/cache";

import { createPublishJobSchema, jobIdSchema } from "@/components/publish/publish-schemas";
import { buildCreateJobInput } from "@/app/actions/publish-job-input";
import { ACTION_OK, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { CAPTION_REQUIRED_MESSAGE } from "@/lib/domain/publish";
import { ROUTES } from "@/lib/routes";

export async function approvePublishJob(jobId: string): Promise<ActionResult> {
  const parsed = jobIdSchema.safeParse({ jobId });
  if (!parsed.success) return validationFail(parsed.error, "Geçersiz istek.");

  try {
    const { repo, wsId } = await getPanelContext();
    await repo.approvePublishJob(wsId, parsed.data.jobId);
    revalidatePath(ROUTES.publish);
    return ACTION_OK;
  } catch (error) {
    return toActionError(error);
  }
}

/** Taslağı onaya gönderir (`draft` → `awaiting_approval`). Onay değildir: yayın yine insan onayı bekler. */
export async function submitPublishJob(jobId: string): Promise<ActionResult> {
  const parsed = jobIdSchema.safeParse({ jobId });
  if (!parsed.success) return validationFail(parsed.error, "Geçersiz istek.");

  try {
    const { repo, wsId } = await getPanelContext();
    await repo.submitPublishJob(wsId, parsed.data.jobId);
    revalidatePath(ROUTES.publish);
    return ACTION_OK;
  } catch (error) {
    // Depo yalnız açıklama boşsa invalid_input verir.
    return toActionError(error, { invalid_input: CAPTION_REQUIRED_MESSAGE, invalid_state: "Yalnız taslak onaya gönderilebilir. Sayfa güncel olmayabilir; yenileyip tekrar dene." });
  }
}

export async function cancelPublishJob(jobId: string): Promise<ActionResult> {
  const parsed = jobIdSchema.safeParse({ jobId });
  if (!parsed.success) return validationFail(parsed.error, "Geçersiz istek.");

  try {
    const { repo, wsId } = await getPanelContext();
    await repo.cancelPublishJob(wsId, parsed.data.jobId);
    revalidatePath(ROUTES.publish);
    return ACTION_OK;
  } catch (error) {
    return toActionError(error);
  }
}

export async function createPublishJob(input: unknown): Promise<ActionResult> {
  const parsed = createPublishJobSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);

  try {
    const context = await getPanelContext();
    const built = await buildCreateJobInput(context, parsed.data);
    if (!built.ok) return built;
    await context.repo.createPublishJob(context.wsId, built.input);
    revalidatePath(ROUTES.publish);
    return ACTION_OK;
  } catch (error) {
    return toActionError(error);
  }
}
