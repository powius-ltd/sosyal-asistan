/**
 * Saf istatistik yardımcıları — Python `statistics` + pandas `Series.corr` paritesi.
 *
 * Hesaplanamayan değer `undefined` döner, asla 0 değil. Yan etki yok.
 */

/** Neumaier (telafili) toplama: Python `statistics.mean`'in kesin toplamına yakın sonuç verir. */
function sum(values: readonly number[]): number {
  let s = 0;
  let c = 0;
  for (const v of values) {
    const t = s + v;
    c += Math.abs(s) >= Math.abs(v) ? s - t + v : v - t + s;
    s = t;
  }
  return s + c;
}

/** Aritmetik ortalama. Boş dizi → undefined. */
export function mean(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return sum(values) / values.length;
}

/** Medyan (Python `statistics.median`: çift n'de ortadaki ikisinin ortalaması). Boş → undefined. */
export function median(values: readonly number[]): number | undefined {
  const n = values.length;
  if (n === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Persentil sırası (0–100, yüksek = iyi) — Python `outliers._percentile_rank` birebir:
 * kendisinden KESİN küçük değer sayısı / (n − 1) × 100, 1 haneye yuvarlanır. n ≤ 1 → 50.
 */
export function percentileRank(values: readonly number[], value: number): number {
  if (values.length <= 1) return 50;
  let below = 0;
  for (const v of values) if (v < value) below += 1;
  return pyRound((below / (values.length - 1)) * 100, 1);
}

function hasVariance(values: readonly number[]): boolean {
  return new Set(values).size >= 2;
}

/**
 * Pearson korelasyonu (numpy `corrcoef` ile aynı iki geçişli formül, [-1, 1]'e kırpılır).
 * n < 3, uzunluk uyuşmazlığı ya da sabit seri (korelasyon matematiksel olarak tanımsız) → undefined.
 * Yuvarlama yapmaz; Python paritesi için çağıran `pyRound(r, 3)` uygular.
 */
export function pearson(xs: readonly number[], ys: readonly number[]): number | undefined {
  const n = xs.length;
  if (n !== ys.length || n < 3) return undefined;
  if (!hasVariance(xs) || !hasVariance(ys)) return undefined;
  const mx = sum(xs) / n;
  const my = sum(ys) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const r = sxy / (n - 1) / Math.sqrt(sxx / (n - 1)) / Math.sqrt(syy / (n - 1));
  if (!Number.isFinite(r)) return undefined;
  return Math.min(1, Math.max(-1, r));
}

/**
 * Python `round(x, digits)` paritesi. Python double'ın KESİN ondalık değerini tam yarıda
 * çifte yuvarlar (round(2.675, 2) = 2.67, round(0.125, 2) = 0.12, round(2.5) = 2).
 * JS `toFixed` de kesin değeri kullanır ama tam yarıda yukarı yuvarlar; yalnız o durum düzeltilir.
 */
export function pyRound(x: number, digits = 0): number {
  if (!Number.isFinite(x) || Math.abs(x) >= 1e21) return x;
  const abs = Math.abs(x);
  // |x| ≥ ~1e-14 için toFixed(100) double'ın kesin ondalık açılımıdır.
  const exact = abs.toFixed(100);
  const dot = exact.indexOf(".");
  const head = digits > 0 ? exact.slice(0, dot + 1 + digits) : exact.slice(0, dot);
  const tail = exact.slice(dot + 1 + digits);
  let rounded = Number(abs.toFixed(digits));
  if (/^50*$/.test(tail)) {
    const last = Number(head[head.length - 1]);
    if (last % 2 === 0) rounded = Number(head);
  }
  return x < 0 ? -rounded : rounded;
}
