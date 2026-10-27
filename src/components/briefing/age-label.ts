import { formatNumber } from "@/lib/format";
import { DAY_MS } from "@/lib/time";

const HOUR_MS = DAY_MS / 24;
const MINUTE_MS = HOUR_MS / 60;

/**
 * Brifingin yaşı ("3 saat önce"): `now` istekteki tek saattir (`getPanelContext()`), burada saat okunmaz. Zaman okunamıyorsa
 * undefined (kart bunu tire olarak gösterir; "0 dakika" değil). Gelecekteki an (saat farkı) "az önce" sayılır.
 */
export function briefingAgeLabel(generatedAt: string, now: Date): string | undefined {
  const generatedMs = Date.parse(generatedAt);
  const nowMs = now.getTime();
  if (Number.isNaN(generatedMs) || Number.isNaN(nowMs)) return undefined;
  const age = nowMs - generatedMs;
  if (age < MINUTE_MS) return "az önce";
  if (age < HOUR_MS) return `${formatNumber(Math.floor(age / MINUTE_MS))} dakika önce`;
  if (age < DAY_MS) return `${formatNumber(Math.floor(age / HOUR_MS))} saat önce`;
  return `${formatNumber(Math.floor(age / DAY_MS))} gün önce`;
}
