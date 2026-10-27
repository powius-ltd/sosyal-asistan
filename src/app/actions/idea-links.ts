"use server";

/**
 * Fikir ↔ yayınlanan Reels bağı (kullanıcı linki yapıştırır; otomatik öneriyi onaylar/reddeder; bağı kaldırır). Action doğrudan
 * POST ile çağrılabildiği için girdi sunucuda zod ile doğrulanır (`idea-link-input.ts`: depo ile AYNI şema); workspace istemciden
 * ALINMAZ, `getPanelContext()` oturumdaki üyelikten çözer. Bağlantı → kısa kod çevirisi ve durum kuralları depodadır
 * (tanınmayan bağlantı `invalid_input`, `dismissed` fikir `invalid_state`, çifte onay `already_exists`); hata Türkçe mesaja çevrilir.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionOk, toActionError, validationFail, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { linkIdeaToReelSchema, resolveIdeaLinkSchema } from "@/lib/data/idea-link-input";
import type { IdeaLinkStatus } from "@/lib/domain/intel";
import { ROUTES } from "@/lib/routes";

const unlinkSchema = z.object({ ideaId: z.string({ error: "Fikir kimliği metin olmalı." }).trim().min(1, "Fikir kimliği boş olamaz.").max(100, "Fikir kimliği çok uzun.") });

/** Bağ değişince fikir durumu, Genel bakış ve haftalık plan (fikir rozetleri) eskir; bildirim rozeti sayfa düzeninde okunur. */
function revalidateIdeaViews(): void {
  revalidatePath(ROUTES.ideas);
  revalidatePath(ROUTES.overview, "layout");
  revalidatePath(ROUTES.thisWeek);
}

const OVERRIDES = {
  not_found: "Fikir ya da bağ bulunamadı; silinmiş olabilir. Sayfayı yenile.",
  already_exists: "Bu fikir ya da bu Reels zaten başka bir bağda onaylı. Önce eski bağı kaldır.",
  invalid_state: "Bu işlem fikrin ya da bağın şu anki durumunda yapılamıyor (elenmiş fikre Reels bağlanamaz; öneri artık geçerli olmayabilir). Sayfayı yenile.",
} as const;

/**
 * Depo girdi doğrulama hatası (`invalid_input`) kullanıcıya gösterilebilir Türkçe mesaj taşır ("Geçerli bir Instagram içerik bağlantısı
 * yapıştır…"): ortak çeviri bunu genel metne çevirir, burada özgün mesaj korunur. `toActionError` yalnız depo hatasında `invalid_input`
 * kodu verir (beklenmeyen hata `unknown`), bu yüzden `Error` mesajı güvenle iletilir.
 */
function withInputMessage(error: unknown): ReturnType<typeof toActionError> {
  const failure = toActionError(error, OVERRIDES);
  return failure.code === "invalid_input" && error instanceof Error && error.message !== "" ? { ...failure, message: error.message } : failure;
}

export type LinkIdeaResult = ActionResult<{ ideaId: string; status: IdeaLinkStatus }>;

/** "Bu fikir şu Reels oldu": bağlantıyı fikre bağlar. Kendi içerikle eşleşirse onaylı, yoksa içerik bekler (sonraki toplamada çözülür). */
export async function linkIdeaToReelAction(input: unknown): Promise<LinkIdeaResult> {
  const parsed = linkIdeaToReelSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Geçersiz Reels bağlantısı.");
  try {
    const { repo, wsId } = await getPanelContext();
    const link = await repo.linkIdeaToReel(wsId, parsed.data);
    revalidateIdeaViews();
    return actionOk({ ideaId: link.ideaId, status: link.status });
  } catch (error) {
    return withInputMessage(error);
  }
}

export type ResolveIdeaLinkResult = ActionResult<{ linkId: string; status: IdeaLinkStatus }>;

/** Otomatik eşleşme önerisini onaylar (fikir `published` olur) ya da reddeder (aynı çift tekrar önerilmez). */
export async function resolveIdeaLinkAction(input: unknown): Promise<ResolveIdeaLinkResult> {
  const parsed = resolveIdeaLinkSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Geçersiz bağ kararı.");
  try {
    const { repo, wsId } = await getPanelContext();
    const link = await repo.resolveIdeaLink(wsId, parsed.data.linkId, parsed.data.decision);
    revalidateIdeaViews();
    return actionOk({ linkId: link.id, status: link.status });
  } catch (error) {
    return toActionError(error, OVERRIDES);
  }
}

export type UnlinkIdeaResult = ActionResult<{ ideaId: string }>;

/** Fikrin aktif bağını kaldırır; onaylı bağ kalkınca fikir önceki durumuna döner. */
export async function unlinkIdeaAction(input: unknown): Promise<UnlinkIdeaResult> {
  const parsed = unlinkSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Geçersiz fikir kimliği.");
  try {
    const { repo, wsId } = await getPanelContext();
    const idea = await repo.unlinkIdea(wsId, parsed.data.ideaId);
    revalidateIdeaViews();
    return actionOk({ ideaId: idea.id });
  } catch (error) {
    return toActionError(error, { ...OVERRIDES, not_found: "Bu fikrin kaldırılacak bir Reels bağı yok." });
  }
}
