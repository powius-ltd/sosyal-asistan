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
  createdAt: string;
  updatedAt: string;
}

/** Fikir başına tek ETKİN fiş: `hata` dışındaki her durum etkindir (0032 kısmi benzersiz indeks ile aynı kural). */
export function isActiveOrderStatus(status: OrderStatus): boolean {
  return status !== "hata";
}
