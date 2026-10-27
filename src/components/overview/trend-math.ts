/**
 * Genel bakış: değişim hesapları (saf fonksiyonlar). Ölçülemeyen değer `undefined` kalır;
 * hiçbir yerde 0'a çevrilmez (bkz. lib/domain/measured.ts).
 */
import { measured, unmeasured, type Measured } from "@/lib/domain/measured";
import type { TrendPoint } from "@/lib/domain/overview";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import { DAY_MS } from "@/lib/time";

interface Sample {
  day: number;
  value: number;
}

/** "YYYY-MM-DD" → gün numarası (UTC; gün anahtarı zaten workspace saat dilimindedir). */
function dayNumber(dayKey: string): number | undefined {
  const time = Date.parse(`${dayKey}T00:00:00Z`);
  return Number.isNaN(time) ? undefined : Math.round(time / DAY_MS);
}

/** Ölçülmüş noktalar, eskiden yeniye. Boşluklar (undefined) atlanır. */
function measuredSamples(points: TrendPoint[]): Sample[] {
  const samples: Sample[] = [];
  for (const point of points) {
    const day = dayNumber(point.date);
    if (day === undefined || point.value === undefined || !Number.isFinite(point.value)) continue;
    samples.push({ day, value: point.value });
  }
  return samples.sort((a, b) => a.day - b.day);
}

export function hasMeasuredPoints(points: TrendPoint[]): boolean {
  return measuredSamples(points).length > 0;
}

/** Ölçülmüş nokta sayısı (boşluklar sayılmaz). Grafik için en az `MIN_CHART_POINTS` nokta gerekir: tek nokta çizgi değildir. */
export function countMeasuredPoints(points: TrendPoint[]): number {
  return measuredSamples(points).length;
}

export const MIN_CHART_POINTS = 2;

/** Serinin bir yerinde ölçülemeyen gün var mı (grafikte boşluk dipnotu için). */
export function hasGaps(points: TrendPoint[]): boolean {
  return points.some((point) => point.value === undefined) && hasMeasuredPoints(points);
}

/**
 * Son ölçüm ile ondan `days` gün önceki (ya da daha eski en yakın) ölçüm.
 * Seri o kadar geriye gitmiyorsa undefined (yeterli geçmiş yok).
 */
export function valuesDaysApart(
  points: TrendPoint[],
  days: number,
): { latest: number; base: number } | undefined {
  const samples = measuredSamples(points);
  const latest = samples.at(-1);
  if (!latest) return undefined;
  const base = samples.findLast((sample) => sample.day <= latest.day - days);
  return base ? { latest: latest.value, base: base.value } : undefined;
}

export interface Change {
  /** Biçimlenmiş metin ("+120 (+%1,4)") ya da ölçülemedi + sebep. */
  text: Measured<string>;
  /** -1 düştü · 0 değişmedi · 1 arttı; ölçülemediyse 0. */
  direction: -1 | 0 | 1;
}

/** `latest` ile `base` arasındaki değişim. Biri yoksa "ölçülemedi" (sebebiyle). */
export function changeBetween(latest: number | undefined, base: number | undefined, reason: string): Change {
  if (latest === undefined || base === undefined || !Number.isFinite(latest) || !Number.isFinite(base)) {
    return { text: unmeasured(reason), direction: 0 };
  }
  const delta = latest - base;
  const sign = delta > 0 ? "+" : "";
  const percent = base > 0 ? formatPercent(delta / base) : undefined;
  const text = `${sign}${formatCompact(delta)}${percent ? ` (${sign}${percent})` : ""}`;
  return { text: measured(text), direction: delta > 0 ? 1 : delta < 0 ? -1 : 0 };
}

/** Takipçi serisinde son `days` günlük değişim. */
export function trendChange(points: TrendPoint[] | undefined, days: number): Change {
  const pair = points ? valuesDaysApart(points, days) : undefined;
  return changeBetween(
    pair?.latest,
    pair?.base,
    `Son ${days} gün için yeterli takipçi geçmişi yok; değişim hesaplanamadı.`,
  );
}

/** Grafik değer biçimi: ölçülemeyen "—" (tooltip ile aynı biçim). */
type ValueFormat = (value: number) => string | undefined;

/**
 * Grafiğin erişilebilir özeti (D3-15; `aria-label`): ilk ve son ölçüm (tarihli) ile yön, ölçülemeyen gün sayısı. Tek tek noktalar odaklanmaz,
 * ekran okuyucu eğilimi bu cümleden duyar. Yeterli ölçüm yoksa (2'den az) undefined: çağıran yalnız adı okutur. Metin sayıyı tooltip'in
 * biçimleyicisiyle yazar (`format`), gün anahtarı "30 Eyl 2026" biçimindedir.
 */
export function trendSummary(points: TrendPoint[], format: ValueFormat, formatDay: (dayKey: string) => string | undefined): string | undefined {
  const measuredPoints = points.filter((point) => point.value !== undefined && Number.isFinite(point.value));
  if (measuredPoints.length < MIN_CHART_POINTS) return undefined;
  const first = measuredPoints[0];
  const last = measuredPoints[measuredPoints.length - 1];
  const firstText = format(first.value as number);
  const lastText = format(last.value as number);
  if (firstText === undefined || lastText === undefined) return undefined;
  const delta = (last.value as number) - (first.value as number);
  const direction = delta > 0 ? "yükseldi" : delta < 0 ? "düştü" : "değişmedi";
  const gaps = points.length - measuredPoints.length;
  const parts = [
    `İlk ölçüm ${formatDay(first.date) ?? first.date}: ${firstText}.`,
    `Son ölçüm ${formatDay(last.date) ?? last.date}: ${lastText}.`,
    `Genel olarak ${direction}.`,
  ];
  if (gaps > 0) parts.push(`${formatNumber(gaps)} günde ölçüm yok.`);
  return parts.join(" ");
}
