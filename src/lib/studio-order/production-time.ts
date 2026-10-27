/**
 * Üretim saatini fişe yazar (panelin yazabildiği tek ek alan: `uretim_saati`, stüdyonun üretime başlayacağı İstanbul saati).
 * Fiş `<kök>/<stüdyo hesabı>/<hafta>/<siparis_id>.md` altında `siparis_id` ile bulunur (başka hesabın fişi bu yoldan ERİŞİLMEZ); yalnız
 * `durum: taslak` fişte yazılır (üretim başladıktan sonra saat değişmez). Saat: geçerli `YYYY-AA-GG SS:DD` (25:99, 02-30 red), `istenen_saat`'ten sonra olamaz, şu andan
 * (İstanbul) önce olamaz. Yazım geçici dosya + `rename` (yarım dosya kalmaz); yalnız `uretim_saati` satırı değişir, kalan her şey aynen kalır.
 */
import { setFrontmatterFields } from "@/lib/studio-order/frontmatter";
import { readTicket } from "@/lib/studio-order/ticket-file";
import type { Ticket } from "@/lib/studio-order/schema";
import { findTicketPath, nodeTicketIo, replaceTicketFile, type TicketIo } from "@/lib/studio-order/ticket-io";
import { isValidIstanbulStamp, istanbulStamp } from "@/lib/studio-order/time";

const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const ORDER_ID = /^[a-z0-9-]+$/;
const STUDIO_SLUG = /^[a-z0-9-]+$/;

export type ProductionTimeErrorCode = "invalid_input" | "invalid_state" | "not_found";

export class ProductionTimeError extends Error {
  constructor(
    readonly code: ProductionTimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProductionTimeError";
  }
}

export interface SetProductionTimeInput {
  /** Sipariş kökü (`ordersRootOf`). */
  root: string;
  /** Stüdyodaki çalışma alanı slug'ı (fişte `hesap`). */
  studioSlug: string;
  siparisId: string;
  /** İstanbul duvar saati `YYYY-AA-GG SS:DD`. */
  stamp: string;
  now: Date;
  io?: TicketIo;
}

export function setOrderProductionTime(input: SetProductionTimeInput): { path: string; ticket: Ticket } {
  const io = input.io ?? nodeTicketIo;
  if (!STAMP.test(input.stamp) || !isValidIstanbulStamp(input.stamp)) throw new ProductionTimeError("invalid_input", "Üretim saati 'YYYY-AA-GG SS:DD' (İstanbul saati) biçiminde olmalı.");
  // Kök dışına çıkış yok: kimlik ve hesap yalnız küçük harf / rakam / tire.
  if (!ORDER_ID.test(input.siparisId) || !STUDIO_SLUG.test(input.studioSlug)) throw new ProductionTimeError("not_found", "Sipariş bulunamadı.");

  const path = findTicketPath(input.root, input.studioSlug, input.siparisId);
  if (path === undefined) throw new ProductionTimeError("not_found", "Sipariş bulunamadı.");
  const text = io.read(path);
  const { ticket } = readTicket(text);
  if (ticket.siparis_id !== input.siparisId || ticket.hesap !== input.studioSlug) throw new ProductionTimeError("not_found", "Sipariş bulunamadı.");
  if (ticket.durum !== "taslak") throw new ProductionTimeError("invalid_state", "Üretim saati yalnız taslak siparişte değiştirilir; bu sipariş artık taslak değil.");
  if (input.stamp > ticket.istenen_saat) throw new ProductionTimeError("invalid_input", "Üretim saati, istenen yayın saatinden sonra olamaz.");
  if (input.stamp < istanbulStamp(input.now)) throw new ProductionTimeError("invalid_input", "Üretim saati geçmişte olamaz.");

  const next = setFrontmatterFields(text, { uretim_saati: input.stamp });
  readTicket(next); // şemadan geçmeyen fiş yazılmaz
  if (!replaceTicketFile(path, text, next, io)) throw new ProductionTimeError("invalid_state", "Sipariş az önce değişti; üzerine yazılmadı. Yeniden dene.");
  return { path, ticket: readTicket(io.read(path)).ticket };
}
