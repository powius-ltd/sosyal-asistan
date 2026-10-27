/**
 * Gösterim biçimleri (tr-TR, varsayılan saat dilimi Europe/Istanbul).
 * Tüm fonksiyonlar `undefined`/geçersiz girdide `undefined` döner — "—" gösterimi
 * `MeasuredValue` bileşeninin işidir; burada asla 0/boş dizge uydurulmaz.
 */

export const DEFAULT_TIMEZONE = "Europe/Istanbul";
/** Tüm gösterim biçimlerinin dili. Sunucu ve tarayıcı aynı biçimi üretsin diye çalışma zamanı diline (varsayılan Intl) güvenilmez; Intl kullanan her yer bunu verir. */
export const LOCALE = "tr-TR";

const numberFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

function isFiniteNumber(n: number | undefined | null): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** 1234567 → "1.234.567". */
export function formatNumber(n: number | undefined | null): string | undefined {
  return isFiniteNumber(n) ? numberFormat.format(n) : undefined;
}

/** Basamak sayısına göre tek bir `Intl.NumberFormat` (satır başına yeniden üretilmesin). */
const fixedFormats = new Map<number, Intl.NumberFormat>();

/**
 * Sabit ondalık basamaklı sayı (tr-TR): `formatDecimal(12.345, 1)` → "12,3"; `formatDecimal(0.8, 2)` → "0,80".
 * `digits` 0–10 aralığına kırpılır. Ölçülemeyen girdi → undefined. `formatNumber` tam sayıya yuvarlar;
 * skor/oran gibi ondalıklı değerler için bunu kullan.
 */
export function formatDecimal(n: number | undefined | null, digits = 1): string | undefined {
  if (!isFiniteNumber(n)) return undefined;
  const fractionDigits = Math.min(Math.max(Math.trunc(Number.isFinite(digits) ? digits : 1), 0), 10);
  let format = fixedFormats.get(fractionDigits);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
    fixedFormats.set(fractionDigits, format);
  }
  return format.format(n);
}

/** Büyükten küçüğe: B = bin, Mn = milyon, Mr = milyar. */
const COMPACT_UNITS = [
  { min: 1_000_000_000, suffix: " Mr" },
  { min: 1_000_000, suffix: " Mn" },
  { min: 1_000, suffix: " B" },
] as const;

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Kısaltma: 950 → "950", 12345 → "12,3 B", 1_500_000 → "1,5 Mn", 2_100_000_000 → "2,1 Mr".
 *
 * SAYI BİÇİMİ KURALI (müşteri ekranları): büyük sayı KPI kutusunda, kartta ve listede hep bu biçimle yazılır (Özet "21,3 B", rakip tablosu
 * "14,9 B" aynı dili konuşur); bu yüzden `MeasuredValue`'ya `format={formatCompact}` verilir. Kesin değer (`formatNumber`: "21.314") yalnız
 * ayrıntıda bilerek kalır: grafik ipucu balonu ve erişilebilir özeti, tablo ayrıntısı, sayfa sayacı ("1–20 / 134"), küçük sayımlar (video,
 * kelime, adet). Aynı ekranda aynı büyüklük iki biçimle görünmez.
 */
export function formatCompact(n: number | undefined | null): string | undefined {
  if (!isFiniteNumber(n)) return undefined;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs < 1_000) return sign + numberFormat.format(abs);

  let idx = COMPACT_UNITS.findIndex((u) => abs >= u.min);
  let value = round1(abs / COMPACT_UNITS[idx].min);
  // 999.960 → "1.000 B" olmasın: yuvarlama bir üst birime taşarsa o birimi kullan.
  if (value >= 1000 && idx > 0) {
    idx -= 1;
    value = round1(abs / COMPACT_UNITS[idx].min);
  }
  return sign + decimalFormat.format(value) + COMPACT_UNITS[idx].suffix;
}

/** Gün sayısı: 90 → "90 gün". Ölçülemeyen/negatif girdi → undefined. */
export function formatDays(days: number | undefined | null): string | undefined {
  return isFiniteNumber(days) && days >= 0 ? `${numberFormat.format(days)} gün` : undefined;
}

/** Yayından bu yana geçen gün: 0 → "bugün" · 1 → "dün" · 12 → "12 gün önce". Ölçülemeyen/negatif girdi → undefined. */
export function formatDaysAgo(days: number | undefined | null): string | undefined {
  if (!isFiniteNumber(days) || days < 0) return undefined;
  const whole = Math.floor(days);
  return whole === 0 ? "bugün" : whole === 1 ? "dün" : `${numberFormat.format(whole)} gün önce`;
}

/** 0.1234 → "%12,3". Girdi 0..1 oran. */
export function formatPercent(ratio: number | undefined | null, fractionDigits = 1): string | undefined {
  if (!isFiniteNumber(ratio)) return undefined;
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(ratio);
}

/** 4.62 → "4,6x". */
export function formatLift(lift: number | undefined | null): string | undefined {
  return isFiniteNumber(lift) ? `${decimalFormat.format(lift)}x` : undefined;
}

/** Para birimi × basamak başına tek `Intl.NumberFormat`; geçersiz para birimi kodu → undefined (Intl hata fırlatır). */
const moneyFormats = new Map<string, Intl.NumberFormat | undefined>();

function moneyFormat(currency: string, digits: number): Intl.NumberFormat | undefined {
  const key = `${currency}|${digits}`;
  if (!moneyFormats.has(key)) {
    let format: Intl.NumberFormat | undefined;
    try {
      format = new Intl.NumberFormat(LOCALE, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
    } catch {
      format = undefined;
    }
    moneyFormats.set(key, format);
  }
  return moneyFormats.get(key);
}

/**
 * Para (tr-TR): `formatMoney(1250, "TRY")` → "₺1.250,00"; `formatMoney(12.5, "USD")` → "$12,50". 1 sentin altı tutarlar 4 basamak
 * ("$0,0023"). Ölçülemeyen tutar → undefined. Tanınmayan para birimi kodu uydurulmaz: sayı + kod yazılır ("12,50 XX1").
 */
export function formatMoney(amount: number | undefined | null, currency: string): string | undefined {
  if (!isFiniteNumber(amount)) return undefined;
  const digits = Math.abs(amount) > 0 && Math.abs(amount) < 0.01 ? 4 : 2;
  const code = currency.trim().toUpperCase();
  return moneyFormat(code, digits)?.format(amount) ?? `${formatDecimal(amount, digits)} ${code}`.trim();
}

/** USD: 12.5 → "$12,50"; 0.0023 → "$0,0023" (1 sentin altı tutarlar 4 basamak). */
export function formatUsd(amount: number | undefined | null): string | undefined {
  return formatMoney(amount, "USD");
}

/** 75 → "1:15"; 3725 → "1:02:05". */
export function formatDuration(totalSeconds: number | undefined | null): string | undefined {
  if (!isFiniteNumber(totalSeconds) || totalSeconds < 0) return undefined;
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * Geçen süre, sözle (iş ve adım süresi; video uzunluğu için `formatDuration`): 0,4 → "1 sn'den kısa" · 45 → "45 sn" · 372 → "6 dk 12 sn" ·
 * 600 → "10 dk" · 3900 → "1 sa 5 dk". En büyük iki birim yazılır; sıfır olan ikinci birim yazılmaz.
 */
export function formatElapsed(totalSeconds: number | undefined | null): string | undefined {
  if (!isFiniteNumber(totalSeconds) || totalSeconds < 0) return undefined;
  if (totalSeconds < 1) return "1 sn'den kısa";
  const total = Math.round(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const [major, minor]: [string, string | undefined] =
    hours > 0
      ? [`${formatNumber(hours)} sa`, minutes > 0 ? `${formatNumber(minutes)} dk` : undefined]
      : minutes > 0
        ? [`${formatNumber(minutes)} dk`, seconds > 0 ? `${formatNumber(seconds)} sn` : undefined]
        : [`${formatNumber(seconds)} sn`, undefined];
  return minor === undefined ? major : `${major} ${minor}`;
}

function toDate(value: string | Date | undefined | null): Date | undefined {
  if (value === undefined || value === null) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Intl.DateTimeFormat üretmek pahalıdır (listelerde satır başına çağrılır); saat dilimi ve
 * tür başına bir kez üretilip saklanır.
 */
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(kind: "date" | "datetime" | "daykey", timeZone: string): Intl.DateTimeFormat {
  const key = `${kind}|${timeZone}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter =
      kind === "date"
        ? new Intl.DateTimeFormat(LOCALE, { timeZone, day: "numeric", month: "short", year: "numeric" })
        : kind === "datetime"
          ? new Intl.DateTimeFormat(LOCALE, {
              timeZone,
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
          : new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

/** ISO → "30 Eyl 2026" (verilen saat diliminde). */
export function formatDate(
  value: string | Date | undefined | null,
  timeZone: string = DEFAULT_TIMEZONE,
): string | undefined {
  const d = toDate(value);
  return d ? dateFormatter("date", timeZone).format(d) : undefined;
}

/** ISO → "30 Eyl 2026 14:05" (verilen saat diliminde, 24 saat). */
export function formatDateTime(
  value: string | Date | undefined | null,
  timeZone: string = DEFAULT_TIMEZONE,
): string | undefined {
  const d = toDate(value);
  return d ? dateFormatter("datetime", timeZone).format(d) : undefined;
}

/** ISO → "YYYY-MM-DD" (verilen saat diliminde; gün sınırı UTC değil workspace tz'sine göre). */
export function toDayKey(value: string | Date, timeZone: string = DEFAULT_TIMEZONE): string | undefined {
  const d = toDate(value);
  return d ? dateFormatter("daykey", timeZone).format(d) : undefined;
}

// ------------------------------------------------ Saat dilimli saat / gün (plan takvimi)

/** Dilimin ekran adı: "America/New_York" → "ET". Bilinmeyen dilim IANA adıyla kalır (uydurma kısaltma yok). */
const TIME_ZONE_LABELS: Record<string, string> = {
  "America/New_York": "ET",
  "Europe/Istanbul": "İstanbul",
  UTC: "UTC",
};

export function timeZoneLabel(timeZone: string): string {
  return TIME_ZONE_LABELS[timeZone] ?? timeZone;
}

type ClockKind = "time" | "weekday-time" | "day-month";
const clockFormatters = new Map<string, Intl.DateTimeFormat>();

function clockFormatter(kind: ClockKind, timeZone: string): Intl.DateTimeFormat {
  const key = `${kind}|${timeZone}`;
  let formatter = clockFormatters.get(key);
  if (!formatter) {
    const base = { timeZone } as const;
    formatter = new Intl.DateTimeFormat(
      LOCALE,
      kind === "day-month"
        ? { ...base, day: "numeric", month: "short" }
        : kind === "time"
          ? { ...base, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
          : { ...base, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
    );
    clockFormatters.set(key, formatter);
  }
  return formatter;
}

/** ISO → "19:00" (verilen saat diliminde, 24 saat). */
export function formatTime(value: string | Date | undefined | null, timeZone: string = DEFAULT_TIMEZONE): string | undefined {
  const d = toDate(value);
  return d ? clockFormatter("time", timeZone).format(d) : undefined;
}

/**
 * ISO → "Çar 19:00" (kısa gün adı + saat, verilen saat diliminde). Gün adı dilime göre değişebilir: New York Perşembe 19:00
 * İstanbul'da Cuma 02:00'dır; bu yüzden iki dilim yan yana gösterilirken her birinin günü ayrıca yazılır.
 */
export function formatWeekdayTime(
  value: string | Date | undefined | null,
  timeZone: string = DEFAULT_TIMEZONE,
): string | undefined {
  const d = toDate(value);
  if (!d) return undefined;
  const parts = clockFormatter("weekday-time", timeZone).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("weekday")} ${pick("hour")}:${pick("minute")}`;
}

/** "2026-10-05" ya da ISO → "5 Eki" (yıl yok). Gün anahtarı UTC gün başı sayılır: takvim günleri için `timeZone` "UTC" ver. */
export function formatDayMonth(value: string | Date | undefined | null, timeZone: string = DEFAULT_TIMEZONE): string | undefined {
  const d = toDate(value);
  return d ? clockFormatter("day-month", timeZone).format(d) : undefined;
}
