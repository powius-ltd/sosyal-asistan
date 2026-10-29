"use server";

/**
 * Anahtar ekranı (Ayarlar): API anahtarını `.env.local`'a yazar, kaldırır, ücretsiz uçla dener. YALNIZ yerelde ve yönetici modunda
 * (`localKeysEnabled`); action doğrudan POST edilebildiği için kapı her çağrıda sunucuda sorulur. Ad listesi kapalıdır (servis
 * seçimi), çalışma alanı `getPanelContext()`'ten gelir. Anahtar değeri yalnız yazılır: sonuca, günlüğe, hata iletisine girmez.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionFail, actionOk, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { saveKey, removeKey, testKey, type KeyDeps, type KeyOutcome } from "@/lib/local-keys/apply";
import { localKeysEnabled } from "@/lib/local-keys/gate";
import { currentWorkspaceSlug } from "@/lib/local-keys/load";
import { KEY_SERVICES } from "@/lib/local-keys/names";
import { ROUTES } from "@/lib/routes";

const serviceField = z.enum(KEY_SERVICES, { error: "Hizmeti seç." });
const saveSchema = z.strictObject({ service: serviceField, value: z.string({ error: "Anahtarı yapıştır." }).max(1000, "Anahtar fazla uzun.") });
const serviceSchema = z.strictObject({ service: serviceField });

const CLOSED_MESSAGE = "Anahtarlar yalnız kendi bilgisayarında, yönetici modunda girilebilir.";

async function depsOf(): Promise<KeyDeps> {
  return { dir: process.cwd(), env: process.env, workspaceSlug: await currentWorkspaceSlug() };
}

function toResult(outcome: KeyOutcome): ActionResult<{ message: string }> {
  return outcome.ok ? actionOk({ message: outcome.message }) : actionFail(outcome.message, outcome.code);
}

export async function saveLocalKey(input: unknown): Promise<ActionResult<{ message: string }>> {
  if (!localKeysEnabled()) return actionFail(CLOSED_MESSAGE, "invalid_state");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Anahtar geçersiz.");
  try {
    const result = toResult(saveKey(parsed.data.service, parsed.data.value, await depsOf()));
    if (result.ok) revalidatePath(ROUTES.settings);
    return result;
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeLocalKey(input: unknown): Promise<ActionResult<{ message: string }>> {
  if (!localKeysEnabled()) return actionFail(CLOSED_MESSAGE, "invalid_state");
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  try {
    const result = toResult(removeKey(parsed.data.service, await depsOf()));
    if (result.ok) revalidatePath(ROUTES.settings);
    return result;
  } catch (error) {
    return toActionError(error);
  }
}

export async function testLocalKey(input: unknown): Promise<ActionResult<{ message: string }>> {
  if (!localKeysEnabled()) return actionFail(CLOSED_MESSAGE, "invalid_state");
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  try {
    return toResult(await testKey(parsed.data.service, await depsOf()));
  } catch (error) {
    return toActionError(error);
  }
}
