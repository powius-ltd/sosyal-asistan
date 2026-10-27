/** Fişteki saat biçimi: İstanbul duvar saati, `YYYY-AA-GG SS:DD` (panel UTC saklar, fiş İstanbul yazar). */
export const ISTANBUL_TIME_ZONE = "Europe/Istanbul";

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: ISTANBUL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function istanbulStamp(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new Error(`Geçersiz zaman: ${String(value)}`);
  const map = Object.fromEntries(parts.formatToParts(date).map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}

const ISTANBUL_OFFSET_HOURS = 3;
const STAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

/**
 * Fişin İstanbul duvar saati (`YYYY-AA-GG SS:DD`) → UTC anı. Türkiye 2016'dan beri yıl boyu UTC+3'tür (yaz saati yok). Gidiş-dönüş denetimi:
 * geri biçimlenince aynı dizgi çıkmazsa (`25:99`, `02-30`) `undefined`; uydurma saat yok. Şema ve üretim saati AYNI işlevi kullanır.
 */
export function istanbulStampToUtc(stamp: string): Date | undefined {
  const m = STAMP.exec(stamp.trim());
  if (!m) return undefined;
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day, hour - ISTANBUL_OFFSET_HOURS, minute));
  return Number.isNaN(date.getTime()) || istanbulStamp(date) !== stamp.trim() ? undefined : date;
}

export const isValidIstanbulStamp = (stamp: string): boolean => istanbulStampToUtc(stamp) !== undefined;
