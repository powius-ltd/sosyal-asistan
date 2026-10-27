/**
 * Fişin İstanbul duvar saati (`YYYY-AA-GG SS:DD`) ↔ UTC. Türkiye 2016'dan beri yıl boyu UTC+3'tür (yaz saati yok); dönüşüm bu sabitle yapılır
 * işlev `studio-order/time.ts`'tedir (gidiş-dönüş testli); burada yeniden dışa verilir. Geçersiz biçim `undefined` (uydurma saat yok).
 */
import "server-only";
import { istanbulStamp, istanbulStampToUtc } from "@/lib/studio-order/time";

export { istanbulStampToUtc };

/** Zernio'nun ofsetsiz `scheduledFor` biçimi (`timezone` ile yorumlanır): UTC anından İstanbul duvar saati. */
export function zernioScheduledFor(at: Date): string {
  return `${istanbulStamp(at).replace(" ", "T")}:00`;
}
