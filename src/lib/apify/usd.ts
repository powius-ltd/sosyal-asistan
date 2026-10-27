/**
 * Para yardımcıları (USD). `collection_runs` tutarları `numeric(12, 6)`: 6 ondalığa yuvarlanır ki
 * kayan nokta artığı (0,1 × 3 = 0,30000000000000004) DB'ye/karşılaştırmaya taşınmasın.
 */
import "server-only";

export function roundUsd(amount: number): number {
  return Math.round(amount * 1e6) / 1e6;
}

/** Sonlu ve negatif olmayan tutar mı (Apify'ın bildirdiği kullanım gibi dış kaynaklı sayılar için). */
export function isUsableUsd(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
