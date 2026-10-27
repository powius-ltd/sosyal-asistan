/**
 * Önceki döneme göre değişim: yüzde yalnız önceki dönemde yeterli yayın varsa söylenir. Önceki dönem 1-2 yayına ya da birkaç
 * izlenmeye dayanıyorsa oran anlamsız çıkar (ör. +%561.825); o zaman değişim hiç yazılmaz (`undefined`), 0'a ya da uydurma
 * bir orana çevrilmez. Özet ve Sayılar AYNI kuralı kullanır.
 */
import type { Kpi, KpiKey, Overview } from "@/lib/domain/overview";

/** Yüzde söylemek için önceki dönemde en az bu kadar yayın olmalı. */
export const MIN_PREVIOUS_POSTS_FOR_CHANGE = 3;

export function kpiOf(overview: Overview | undefined, key: KpiKey): Kpi | undefined {
  return overview?.kpis.find((kpi) => kpi.key === key);
}

/** İzlenmenin önceki döneme göre oransal değişimi (0.479 = %47,9 artış); koşullar sağlanmazsa undefined. */
export function viewsChange(overview: Overview | undefined): number | undefined {
  const views = kpiOf(overview, "views");
  const previousPosts = kpiOf(overview, "posts")?.previous;
  if (views?.value === undefined || views.previous === undefined) return undefined;
  if (previousPosts === undefined || previousPosts < MIN_PREVIOUS_POSTS_FOR_CHANGE) return undefined;
  if (!Number.isFinite(views.value) || !Number.isFinite(views.previous) || views.previous <= 0) return undefined;
  return (views.value - views.previous) / views.previous;
}

/** Aynı kural yayın sayısı için: önceki dönem ≥ 3 yayınsa oran, değilse undefined. */
export function postsChange(overview: Overview | undefined): number | undefined {
  const posts = kpiOf(overview, "posts");
  if (posts?.value === undefined || posts.previous === undefined) return undefined;
  if (posts.previous < MIN_PREVIOUS_POSTS_FOR_CHANGE || !Number.isFinite(posts.value)) return undefined;
  return (posts.value - posts.previous) / posts.previous;
}
