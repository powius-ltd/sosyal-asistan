/**
 * Fiş (stüdyo siparişi) alan modeli: fikrin çekim siparişi uygulama içinde kalıcıdır (paket 28 G1). `ticket` stüdyo sözleşmesinin
 * (SIPARIS v2) `ticketSchema` çıktısıdır; `status` fişin kendi `durum` alanının aynasıdır (DB CHECK ile ayrışamaz). Serbest `note`
 * dosya biçimindeki gövdeye karşılık gelir. Fiş dayanağı (plan gerekçesi, kanıt videolar) fişe GÖMÜLMEZ: plandan okunur.
 */
import type { OrderStatus, Ticket } from "@/lib/studio-order/schema";

export interface StudioOrder {
  id: string;
  workspaceId: string;
  ideaId: string;
  /** Planın hafta başı (YYYY-AA-GG); plansız fişte yok. */
  weekStart?: string;
  /** Plandaki sıra (0 tabanlı); plansız fişte yok. */
  slot?: number;
  ticket: Ticket;
  note: string;
  status: OrderStatus;
  /** Video sürümü (SPN-36): 1 = ilk sürüm, her revizede +1; en çok `ORDER_REVISION_MAX + 1`. */
  revision: number;
  /** Revize ile yerini yitiren sürümlerin kaydı (eski → yeni; yalnız eklenir). Uzunluk `revision - 1`. */
  revisions: OrderRevisionEntry[];
  createdAt: string;
  updatedAt: string;
}

/** Bir fişe en çok bu kadar revize istenir (sonra yeni fiş yazılır). */
export const ORDER_REVISION_MAX = 3;
/** Revize notu üst sınırı (kod noktası). */
export const ORDER_REVISION_NOTE_MAX = 500;

/** Revize ile yerini yitiren sürümün kaydı. Eski video silinmez: yolu burada durur, yayın satırı iptal edilir. */
export interface OrderRevisionEntry {
  /** Yerini yitiren sürümün numarası (1 = ilk sürüm). */
  version: number;
  /** O sürümün stüdyo sipariş kimliği (`siparis_id`; ilk sürüm `<taban>`, sonrası `<taban>-r<n>`). */
  orderId: string;
  requestedAt: string;
  note: string;
  video?: string;
  cover?: string;
  /** O sürüm için açılmış, revizeyle iptal edilen yayın satırı. */
  publishJobId: string;
}

/** Revize isteme kuralı (TEK yer; mock, Supabase ve ekran aynısını sorar). Sebep yoksa `undefined`. */
export type OrderRevisionProblem = "not_produced" | "limit" | "no_pending_publish";

/** `publishStatus`: fişin güncel sürümü için açık (iptal / düşmemiş) yayın satırının durumu; satır yoksa `undefined`. */
export function orderRevisionProblem(order: Pick<StudioOrder, "status" | "revision" | "ticket">, publishStatus: string | undefined): OrderRevisionProblem | undefined {
  if (order.status !== "uretildi" || order.ticket.video === undefined) return "not_produced";
  if (order.revision > ORDER_REVISION_MAX) return "limit";
  if (publishStatus !== "awaiting_approval" && publishStatus !== "draft") return "no_pending_publish";
  return undefined;
}

/** Kalan revize hakkı (0–3). */
export function revisionsLeft(order: Pick<StudioOrder, "revision">): number {
  return Math.max(0, ORDER_REVISION_MAX + 1 - order.revision);
}

/** Fikir başına tek ETKİN fiş: `hata` dışındaki her durum etkindir (0032 kısmi benzersiz indeks ile aynı kural). */
export function isActiveOrderStatus(status: OrderStatus): boolean {
  return status !== "hata";
}
