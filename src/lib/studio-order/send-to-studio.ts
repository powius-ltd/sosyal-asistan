/**
 * Fişi stüdyoya gönderme (SPN-33 "Hat H1: kapı"): panelin kalıcı fişi (`studio_orders`) stüdyonun sipariş klasörüne `onay: evet` ile yazılır.
 * Gönderme ONAYDIR: fişi stüdyo klasöründe onaylı hale getiren tek yer burasıdır. İki parça:
 *
 *  - `orderSendProblem` (SAF): fiş stüdyonun kapısından geçer mi? Aksiyon istek anında, işçi gönderme anında AYNI kuralı sorar.
 *  - `sendOrderToStudio`: dosyayı yazar (geçici dosya + `link`: var olan dosyanın üstüne ASLA yazmaz, yarım dosya görünmez) ve panel
 *    fişini `uretiliyor` yapar. İdempotent: dosya zaten varsa dokunmaz, mevcut durumu söyler. Yol `<kök>/<stüdyo slug>/<hafta>/<siparis_id>.md`;
 *    parçalar şemadan geçmiş fişten gelir (istekten gelen değer yola girmez).
 *
 * Kapı kapsamı stüdyonun `run-order.ts`'iyle birebirdir: yalnız metin (`senaryo`) kipi ve broll / animasyon / karışık türleri üretilir.
 */
import "server-only";
import { existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { PanelRepository } from "@/lib/data/repository";
import type { StudioOrder } from "@/lib/domain/studio-order";
import { findStudioAccount, type StudioAccount } from "@/lib/studio-order/accounts";
import type { OrderStatus } from "@/lib/studio-order/schema";
import { readTicket, writeTicket } from "@/lib/studio-order/ticket-file";

/** Gönderilemeyen fişin nedeni (kod; düz dil cümlesi `plain-language-order.ts` `ORDER_SEND_PROBLEM_PLAIN`). */
export type OrderSendProblem = "not_draft" | "no_studio_account" | "kind_narration" | "kind_ugc" | "mode_topic";

const SENDABLE_STATUSES: readonly OrderStatus[] = ["taslak", "uretiliyor"];

/** Fiş stüdyoya gönderilebilir mi? Gönderilebiliyorsa `undefined`. `uretiliyor` yeniden denemeye izin verir (iş yarıda kalmıştı). */
export function orderSendProblem(order: Pick<StudioOrder, "status" | "ticket">, account: StudioAccount | undefined): OrderSendProblem | undefined {
  if (!SENDABLE_STATUSES.includes(order.status)) return "not_draft";
  if (account === undefined) return "no_studio_account";
  if (order.ticket.tur === "anlatim") return "kind_narration";
  if (order.ticket.tur === "ugc") return "kind_ugc";
  if (order.ticket.mod !== "senaryo" || account.mode !== "senaryo") return "mode_topic";
  return undefined;
}

export class OrderSendError extends Error {
  constructor(
    readonly code: OrderSendProblem | "order_missing" | "slug_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "OrderSendError";
  }
}

export interface SendOrderInput {
  repo: PanelRepository;
  wsId: string;
  /** Panel fişinin kimliği (`studio_orders.id`). */
  orderId: string;
  /** Çalışma alanının panel slug'ı (stüdyo hesabı buradan çözülür). */
  panelSlug: string | undefined;
  now: Date;
  /** Sipariş klasörünün kökü (`orderRootOf()`); testte geçici klasör. */
  root: string;
}

export interface SendOrderResult {
  /** `written`: dosya şimdi yazıldı · `exists`: dosya zaten vardı, dokunulmadı. */
  outcome: "written" | "exists";
  /** Stüdyodaki fiş yolu. */
  path: string;
  /** Stüdyo `siparis_id`'si (dönüş bununla bulunur). */
  ticketId: string;
  studioSlug: string;
  /** Dosyadaki güncel durum (mevcut dosyada stüdyonun ilerlettiği durum olabilir). */
  fileStatus: OrderStatus;
}

/** Dosyayı yalnız yoksa yazar (geçici dosya + sert bağ: var olanın üstüne yazılmaz, okuyan yarım dosya görmez). true = yazıldı. */
function writeIfAbsent(path: string, text: string): boolean {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { encoding: "utf8", flag: "wx" });
  try {
    linkSync(tmp, path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    unlinkSync(tmp);
  }
}

export async function sendOrderToStudio(input: SendOrderInput): Promise<SendOrderResult> {
  const order = await input.repo.getStudioOrder(input.wsId, input.orderId);
  if (order === undefined) throw new OrderSendError("order_missing", "Fiş bulunamadı.");
  const account = findStudioAccount(input.panelSlug);
  const problem = orderSendProblem(order, account);
  if (problem !== undefined || account === undefined) throw new OrderSendError(problem ?? "no_studio_account", `Fiş stüdyoya gönderilemez (${problem ?? "no_studio_account"}).`);
  if (order.ticket.hesap !== account.studioSlug) throw new OrderSendError("slug_mismatch", "Fişin hesabı çalışma alanının stüdyo hesabıyla uyuşmuyor.");

  const dir = join(input.root, account.studioSlug, order.ticket.plan_hafta);
  const path = join(dir, `${order.ticket.siparis_id}.md`);
  let outcome: SendOrderResult["outcome"] = "exists";
  let fileStatus: OrderStatus;
  if (existsSync(path)) {
    fileStatus = readTicket(readFileSync(path, "utf8")).ticket.durum;
  } else {
    mkdirSync(dir, { recursive: true });
    const text = writeTicket({ ...order.ticket, onay: true, durum: "taslak" }, order.note);
    outcome = writeIfAbsent(path, text) ? "written" : "exists";
    fileStatus = outcome === "written" ? "taslak" : readTicket(readFileSync(path, "utf8")).ticket.durum;
  }
  // Panel fişi "üretiliyor" olur (onaylı). Dosya yazıldıktan SONRA: yazım düşerse panel taslak kalır, yeniden deneme güvenlidir.
  if (order.status === "taslak") await input.repo.advanceStudioOrder(input.wsId, order.id, { status: "uretiliyor" }, input.now);
  return { outcome, path, ticketId: order.ticket.siparis_id, studioSlug: account.studioSlug, fileStatus };
}
