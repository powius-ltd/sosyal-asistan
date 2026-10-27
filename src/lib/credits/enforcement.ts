/**
 * Kredi zorlaması anahtarı: TEK okuma yeri. `CREDITS_ENFORCED=on` ise panel işleri krediye bağlanır (istekte ayır, bitişte kesinleştir,
 * yetersizde başlatma); başka her değerde ve tanımsızken KAPALIDIR ve davranış zorlama öncesiyle birebir aynıdır (ayırma / düşüm yok,
 * hiçbir iş engellenmez). Hem panel süreci (depo: iş isteği) hem işçi (ayrılmamış işi koşturmama) bu fonksiyonu okur; ikisi aynı
 * `.env.local`'ı kullanır. Ekranda gösterilecek "zorlama açık mı" bilgisi de buradan gelmelidir (kopya okuma yazılmaz).
 */
import { panelEdition } from "@/lib/edition";

export const CREDITS_ENFORCED_ENV = "CREDITS_ENFORCED";

export function isCreditsEnforced(env: Record<string, string | undefined> = process.env): boolean {
  if (panelEdition(env.PANEL_EDITION) === "kopya") return false; // müşteri kopyasında kredi yok
  return env[CREDITS_ENFORCED_ENV]?.trim().toLowerCase() === "on";
}
