/**
 * Yeni yayın işi girdisinin sunucu tarafı hazırlığı: `createPublishJob` ve `replacePublishJob` AYNI kuralları uygular (kopya yok).
 * "use server" DEĞİL: yardımcıdır, doğrudan çağrılamaz. Hesap bulunur ve bağlı mı bakılır, planlanan zaman workspace saat diliminden
 * UTC'ye çevrilir ve tek saate (`now`) göre geçmişte mi denetlenir.
 */
import { fromZonedTime } from "date-fns-tz";

import type { createPublishJobSchema } from "@/components/publish/publish-schemas";
import { INVALID_SCHEDULE_MESSAGE, PAST_SCHEDULE_MESSAGE } from "@/components/publish/publish-messages";
import { actionFail, type ActionFailure } from "@/lib/actions/result";
import type { getPanelContext } from "@/lib/data";
import type { CreatePublishJobInput } from "@/lib/data/queries";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { isPublishableAccount } from "@/lib/publish/publishable";
import type { z } from "zod";

type PanelContext = Awaited<ReturnType<typeof getPanelContext>>;
type CreateValues = z.output<typeof createPublishJobSchema>;

/** Planlanan zaman geçmişe düşerse (saat farkı/gecikme payı) reddedilir. */
const PAST_TOLERANCE_MS = 60_000;

/** Doğrulanmış form değerlerinden depo girdisi; hesap / zaman sorunu varsa hata sonucu. `extra.ideaId`: kopyalanan işin fikri. */
export async function buildCreateJobInput(
  { repo, wsId, now }: Pick<PanelContext, "repo" | "wsId" | "now">,
  values: CreateValues,
  extra: { ideaId?: string; orderId?: string; mediaPath?: string } = {},
): Promise<{ ok: true; input: CreatePublishJobInput } | ActionFailure> {
  const [accounts, workspace] = await Promise.all([repo.listOwnAccounts(wsId), repo.getWorkspace(wsId)]);

  const account = accounts.find((a) => a.id === values.socialAccountId);
  if (!account) return actionFail("Hesap bulunamadı.", "not_found");
  // Yalnız resmi API ile bağlı hesaba yayın işi açılır (kazıma/süresi dolmuş hesap yayın yapamaz). Stüdyo siparişine bağlı satırda
  // (aracı üzerinden yayın) Zernio anahtarını depo denetler (`createPublishJob` → `isPublishableAccount`): burada tek kural, ikinci kopya yok.
  if (!isPublishableAccount(account, extra.orderId !== undefined)) {
    return actionFail("Bu hesap resmi API ile bağlı değil; yayın işi oluşturulamaz.", "invalid_state");
  }

  let scheduledFor: string | undefined;
  if (values.scheduledAt !== "") {
    // Form saati workspace saat diliminde girilir; UTC ISO'ya çevrilir.
    const at = fromZonedTime(values.scheduledAt, workspace?.timezone ?? DEFAULT_TIMEZONE);
    if (Number.isNaN(at.getTime())) return actionFail(INVALID_SCHEDULE_MESSAGE);
    if (at.getTime() < now.getTime() - PAST_TOLERANCE_MS) return actionFail(PAST_SCHEDULE_MESSAGE);
    scheduledFor = at.toISOString();
  }

  const caption = values.caption.trim();
  return {
    ok: true,
    input: {
      socialAccountId: account.id,
      ideaId: extra.ideaId,
      // Stüdyo siparişi bağı SUNUCUDA eski satırdan taşınır (istemci girdisinden gelmez): düzeltilen satır siparişini ve videosunu yitirmez.
      ...(extra.orderId === undefined ? {} : { orderId: extra.orderId }),
      ...(extra.mediaPath === undefined ? {} : { mediaPath: extra.mediaPath }),
      caption: caption === "" ? undefined : caption,
      scheduledFor,
      paidPartnership: values.paidPartnership,
      aiGenerated: values.aiGenerated,
      // Reklam veren yalnız ücretli iş birliğinde anlamlıdır; kapalı deneme yayını "normal yayın" demektir (alan hiç yazılmaz).
      advertiserName: values.paidPartnership ? values.advertiserName : undefined,
      trial: values.trial?.enabled ? values.trial : undefined,
      status: values.status,
    },
  };
}
