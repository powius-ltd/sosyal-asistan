"use server";

/**
 * Rakip mutasyonları (server action). Action'lar doğrudan POST ile çağrılabilir; bu yüzden:
 *  - girdi sunucuda zod ile doğrulanır (istemci önizlemesine güvenilmez),
 *  - workspace istemciden ALINMAZ: `getPanelContext()` sunucuda çözer (Faz 1'de oturum/üyelik),
 *  - `private`/`not_found` durumları kullanıcı tarafından set edilemez,
 *  - depo hatası ortak yardımcıyla (`@/lib/actions/result`) Türkçe mesaja çevrilir, beklenmeyen hata
 *    ayrıntısı sızdırılmaz.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAddablePlatform } from "@/components/competitors/add-config";
import { HANDLE_ERROR_MESSAGE, isOwnHandle, parseHandle } from "@/components/competitors/handle";
import { actionFail, actionOk, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { PLATFORMS } from "@/lib/domain/platform";
import { RIVAL_PLAIN } from "@/lib/plain-language-account";
import { ROUTES } from "@/lib/routes";

/** Başarıda kullanıcıya gösterilecek metin de döner (toast). */
export type CompetitorActionResult = ActionResult<{ message: string }>;

const addSchema = z.object({
  platform: z.enum(PLATFORMS, { error: "Bu platform henüz desteklenmiyor." }).refine(isAddablePlatform, "Bu platform henüz desteklenmiyor."),
  handle: z.string({ error: "Kullanıcı adı gerekli." }).max(300, "Kullanıcı adı çok uzun."),
});

const statusSchema = z.object({
  competitorId: z.string().min(1).max(100),
  status: z.enum(["candidate", "tracked", "ignored"], { error: "Bu durum kullanıcı tarafından verilemez." }),
});

/**
 * Rakip eklenince/durumu değişince etkilenen tüm sayfalar: rakip listesi + keşfet, Tutanlar (yalnız izlenen rakipler
 * görünür), Genel bakış (tutan içerik, takip edilen rakip, maliyet kartı) ve Ayarlar (koşu listesi + maliyet).
 */
function revalidateCompetitorPages() {
  for (const path of [ROUTES.competitors, ROUTES.discover, ROUTES.outliers, ROUTES.overview, ROUTES.settings]) {
    revalidatePath(path);
  }
}

/** Rakip ekler (varsayılan: doğrudan takibe). */
export async function addCompetitorAction(input: unknown): Promise<CompetitorActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Girdi geçersiz.");

  const handle = parseHandle(parsed.data.handle, parsed.data.platform);
  if (!handle.ok) return actionFail(HANDLE_ERROR_MESSAGE[handle.reason]);

  try {
    const { repo, wsId } = await getPanelContext();
    // Kendi hesabın rakip olamaz (sunucuda da: istemci önizlemesine güvenilmez).
    if (isOwnHandle(await repo.listOwnAccounts(wsId), parsed.data.platform, handle.handle)) return actionFail(RIVAL_PLAIN.ownHandle);
    await repo.addCompetitor(wsId, { platform: parsed.data.platform, handle: handle.handle });
  } catch (error) {
    return toActionError(error, {
      already_exists: `@${handle.handle} zaten ekli.`,
      invalid_input: "Girdi geçersiz. Kullanıcı adını kontrol edip yeniden dene.",
    });
  }
  revalidateCompetitorPages();
  return actionOk({ message: `@${handle.handle} takibe alındı.` });
}

/** İzle / yoksay / aday. `private` ve `not_found` şema düzeyinde reddedilir. */
export async function setCompetitorStatusAction(input: unknown): Promise<CompetitorActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Girdi geçersiz.");

  try {
    const { repo, wsId } = await getPanelContext();
    const updated = await repo.setCompetitorStatus(wsId, parsed.data.competitorId, parsed.data.status);
    revalidateCompetitorPages();
    const label = parsed.data.status === "tracked" ? "izlemeye alındı" : parsed.data.status === "ignored" ? "yoksayıldı" : "aday yapıldı";
    return actionOk({ message: `@${updated.handle} ${label}.` });
  } catch (error) {
    return toActionError(error, {
      invalid_state: "Bu hesabın durumu değiştirilemez (gizli ya da bulunamadı olabilir).",
    });
  }
}
