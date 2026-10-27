/**
 * Tohumlu sözde rastgele sayı üreteci (mulberry32). Mock verinin TEK rastgelelik kaynağı:
 * `Math.random` YASAK — aynı tohum her çalıştırmada birebir aynı veriyi üretmeli.
 *
 * `fork(label)` aynı tohumdan etikete özgü bağımsız bir akış türetir; böylece bir üreteçte
 * çekiliş sayısı değişince diğer üreteçlerin verisi kaymaz.
 */

export const DEFAULT_SEED = 20260930;

export interface Rng {
  /** [0, 1) aralığında sayı. */
  next(): number;
  /** [min, max] aralığında tam sayı (iki uç dahil). */
  int(min: number, max: number): number;
  /** [min, max) aralığında ondalık sayı. */
  float(min: number, max: number): number;
  /** `p` olasılıkla true. */
  chance(p: number): boolean;
  pick<T>(list: readonly T[]): T;
  /** Ağırlıklı seçim: [değer, ağırlık] çiftleri. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
  shuffle<T>(list: readonly T[]): T[];
  /** Normal dağılım (Box-Muller). */
  normal(mean?: number, sd?: number): number;
  /** Olasılıksal yuvarlama: 2.3 → %30 olasılıkla 3, %70 olasılıkla 2 (küçük sayılarda gerçekçi 0'lar). */
  roundStochastic(value: number): number;
  /** Etikete özgü bağımsız alt akış. */
  fork(label: string): Rng;
}

/** 32 bit dizge özeti (FNV-1a). */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function createRng(seed: number = DEFAULT_SEED): Rng {
  const next = mulberry32(seed);

  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (list) => {
      if (list.length === 0) throw new Error("prng: boş listeden seçim yapılamaz");
      return list[Math.floor(next() * list.length)];
    },
    weighted: (entries) => {
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    shuffle: (list) => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    normal: (mean = 0, sd = 1) => {
      const u = Math.max(next(), Number.EPSILON);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    roundStochastic: (value) => {
      const floor = Math.floor(value);
      return floor + (next() < value - floor ? 1 : 0);
    },
    fork: (label) => createRng(hash32(`${seed}:${label}`)),
  };
  return rng;
}

/** FNV-1a: metinden kararlı sayı (aynı kimlik → aynı mock etiketi/kümesi). Rastgelelik değil, kimlikten türetme. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ (char.codePointAt(0) ?? 0), 16777619);
  return h >>> 0;
}
