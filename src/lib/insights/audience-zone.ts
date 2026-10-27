/**
 * Saat/gün analizinin saat dilimi: hedef kitlenin dilimi (`audienceTimeZone`, ör. America/New_York); yoksa çalışma alanının
 * `timezone`'u; o da yoksa/geçersizse varsayılan (`DEFAULT_TIMEZONE`). Depo `audienceTimeZone`'u her zaman doldurur, ama
 * içgörü/plan hesabı yalnız bu iki alanı görebilen çağıranlara da (test, betik) açık kalır ve bozuk bir IANA adıyla
 * (Intl'in fırlattığı) çökmez. Yaprak modül: başka `lib/insights` dosyasına bağlı değildir (döngü olmasın).
 */
import { DEFAULT_TIMEZONE, LOCALE } from "@/lib/format";

export interface ZoneSource {
  audienceTimeZone?: string;
  timezone?: string;
}

function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Saat dilimi: `audienceTimeZone` → `timezone` → `DEFAULT_TIMEZONE`; boş ya da geçersiz ad atlanır. */
export function audienceZone(workspace: ZoneSource): string {
  for (const candidate of [workspace.audienceTimeZone, workspace.timezone]) {
    const zone = candidate?.trim();
    if (zone !== undefined && zone !== "" && isValidZone(zone)) return zone;
  }
  return DEFAULT_TIMEZONE;
}
