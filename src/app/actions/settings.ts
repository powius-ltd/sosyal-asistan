"use server";

/**
 * Workspace ayarları (aylık Apify/LLM tavanı, niş tanımı). Action doğrudan POST ile çağrılabildiği için
 * girdi sunucuda zod ile doğrulanır (`workspacePatchSchema`: tavan 0..1000 USD, niş ≤ 2000 karakter);
 * workspace istemciden ALINMAZ, `getPanelContext()` çözer. Depo yamayı ayrıca doğrular; depo hatası
 * ortak yardımcıyla (`@/lib/actions/result`) Türkçe mesaja çevrilir.
 *
 * Para tavanları (Apify/LLM/ölçüm) YÖNETİCİ ayarıdır: arayüz müşteri görünümünde alanları çizmez, ama action doğrudan POST ile
 * çağrılabildiği için mod sunucuda da denetlenir (`isOperatorMode()`); kapalıyken tavan içeren yama `invalid_state` ile reddedilir.
 */
import { revalidatePath } from "next/cache";

import { ACTION_OK, actionFail, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { workspacePatchSchema } from "@/lib/data/workspace-patch";
import type { WorkspacePatch } from "@/lib/data/queries";
import { ROUTES } from "@/lib/routes";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

/** Yalnız yönetici modunda değişebilen para alanları. */
const MONEY_FIELDS = ["apifyMonthlyCapUsd", "llmMonthlyCapUsd", "measureMonthlyCapUsd", "agentMonthlyCapUsd"] as const satisfies readonly (keyof WorkspacePatch)[];

const OPERATOR_ONLY_MESSAGE = "Bütçe tavanları yalnız yönetici modunda değiştirilebilir.";

/** Yama para alanı içeriyor ve yönetici modu kapalıysa ret; değilse undefined. */
function rejectMoneyOutsideOperator(patch: Partial<WorkspacePatch>): ActionResult | undefined {
  const touchesMoney = MONEY_FIELDS.some((field) => patch[field] !== undefined);
  return touchesMoney && !isOperatorMode() ? actionFail(OPERATOR_ONLY_MESSAGE, "invalid_state") : undefined;
}

export async function updateWorkspaceSettings(input: unknown): Promise<ActionResult> {
  const parsed = workspacePatchSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const denied = rejectMoneyOutsideOperator(parsed.data);
  if (denied) return denied;

  try {
    const { repo, wsId } = await getPanelContext();
    await repo.updateWorkspace(wsId, parsed.data);
    // Tavan Ayarlar'da ve Genel bakış maliyet kartında görünür.
    revalidatePath(ROUTES.settings);
    revalidatePath(ROUTES.overview);
    return ACTION_OK;
  } catch (error) {
    return toActionError(error);
  }
}

/** Ölçüm tavanı: yalnız bu alan, ZORUNLU (verilmemesi hata). Başka alanlar (Apify/LLM tavanı, niş) bu yoldan değişmez (şema fazlalığı atar). */
const measureCapSchema = workspacePatchSchema.pick({ measureMonthlyCapUsd: true }).required();

/**
 * Aylık ÖLÇÜM tavanını kaydeder; kaydetmek bu tutara kadar aylık ölçüm harcamasının ONAYIDIR (depo onay zamanını aynı anda yazar).
 * Onaysızken (`measureMonthlyCapUsd` yok) ölçüm koşusu hiç başlamaz; 0 = ölçüm kapalı (onaylı).
 */
export async function updateMeasureCap(input: unknown): Promise<ActionResult> {
  const parsed = measureCapSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Ölçüm tavanı 0–1000 USD arası bir sayı olmalı.");
  const denied = rejectMoneyOutsideOperator(parsed.data);
  if (denied) return denied;

  try {
    const { repo, wsId } = await getPanelContext();
    await repo.updateWorkspace(wsId, { measureMonthlyCapUsd: parsed.data.measureMonthlyCapUsd });
    revalidatePath(ROUTES.settings);
    revalidatePath(ROUTES.thisWeek);
    return ACTION_OK;
  } catch (error) {
    return toActionError(error);
  }
}
