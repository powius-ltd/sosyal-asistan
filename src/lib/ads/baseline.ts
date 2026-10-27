/**
 * Hesabın dönem içi alışılmışı: harcama ağırlıklı (toplam harcama / toplam sonuç, toplam değer / toplam harcama). Reklam "alışılmışın kaç
 * katı" (`vsBaseline`; maliyet < 1 iyi, getiri > 1 iyi). Kıyas ancak en az iki harcamalı reklam varsa anlamlıdır: tek reklam kendi kendine
 * kıyaslanmaz (`undefined` + sebep).
 */
import { computeAdMetrics, sumAdMetrics, type AdBaseline, type AdDailyMetric } from "@/lib/domain/ads";

export type BaselineReason = "no_spend" | "single_ad";

export interface BaselineResult {
  baseline?: AdBaseline;
  /** Alışılmış kurulamadıysa neden. */
  reason?: BaselineReason;
}

/** `rowsByAd`: reklam başına dönem içi günlük satırlar. */
export function computeBaseline(rowsByAd: ReadonlyMap<string, readonly AdDailyMetric[]>): BaselineResult {
  const all = [...rowsByAd.values()].flat();
  const spending = [...rowsByAd.values()].filter((rows) => sumAdMetrics(rows).spend > 0).length;
  if (spending === 0) return { reason: "no_spend" };
  if (spending < 2) return { reason: "single_ad" };
  const metrics = computeAdMetrics(sumAdMetrics(all));
  if (metrics.costPerResult === undefined && metrics.returnOnSpend === undefined) return { reason: "no_spend" };
  return { baseline: { costPerResult: metrics.costPerResult, returnOnSpend: metrics.returnOnSpend } };
}

const ratioOf = (value: number | undefined, base: number | undefined): number | undefined =>
  value === undefined || base === undefined || base <= 0 || !Number.isFinite(value) ? undefined : value / base;

/** Reklamın alışılmışa oranı; ölçülemeyen `undefined`. */
export function vsBaselineOf(metrics: { costPerResult?: number; returnOnSpend?: number }, baseline: AdBaseline | undefined): { costPerResult?: number; returnOnSpend?: number } {
  return { costPerResult: ratioOf(metrics.costPerResult, baseline?.costPerResult), returnOnSpend: ratioOf(metrics.returnOnSpend, baseline?.returnOnSpend) };
}

/** Alışılmışa göre iyi mi: maliyet < 1 ya da getiri > 1. Ölçülemiyorsa `undefined`. */
export function betterThanBaseline(vs: { costPerResult?: number; returnOnSpend?: number }): boolean | undefined {
  if (vs.returnOnSpend !== undefined) return vs.returnOnSpend > 1;
  if (vs.costPerResult !== undefined) return vs.costPerResult < 1;
  return undefined;
}
