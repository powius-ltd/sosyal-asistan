/**
 * "Üretime gönder" isteğinin ön denetimi (SPN-33): fiş bu çalışma alanında var mı ve stüdyoya gönderilebilir mi? İşçi gönderme anında AYNI
 * kuralı (`orderSendProblem`) yeniden sorar; burada önden bakılmasının tek nedeni kullanıcıya nedenini düz cümleyle söyleyebilmektir.
 * Sorun yoksa undefined. Fiş kimliği istekten gelir ama yalnız okunur: komut satırına / yola girmez.
 */
import "server-only";

import type { PanelRepository } from "@/lib/data/repository";
import { ORDER_SEND_PROBLEM_PLAIN } from "@/lib/plain-language-order";
import { findStudioAccount } from "@/lib/studio-order/accounts";
import { orderSendProblem } from "@/lib/studio-order/send-to-studio";

export const PRODUCE_ORDER_MISSING = "Fiş bulunamadı; silinmiş olabilir. Sayfayı yenile.";

export async function produceRequestProblem(repo: Pick<PanelRepository, "getStudioOrder">, wsId: string, panelSlug: string | undefined, orderId: string): Promise<string | undefined> {
  const order = await repo.getStudioOrder(wsId, orderId);
  if (order === undefined) return PRODUCE_ORDER_MISSING;
  const problem = orderSendProblem(order, findStudioAccount(panelSlug));
  return problem === undefined ? undefined : ORDER_SEND_PROBLEM_PLAIN[problem];
}
