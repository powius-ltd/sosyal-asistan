/**
 * İzlenme özeti: bir hesabın kısa videolarının medyan izlenmesi, YALNIZ hesabın en sık görülen `viewsKind`'ı
 * içinde. Farklı views türleri (`ig_play_count` ↔ `ig_view_count` …) ve formatlar (karusel/görsel izlenmesi
 * yoktur) birbirine karıştırılmaz; bu yüzden tüm içeriğin tek medyanı alınmaz.
 */
import { median } from "@/lib/metrics/stats";
import type { ContentFormat, ViewsKind } from "@/lib/platforms/types";

export interface ViewsSample {
  format: ContentFormat;
  views?: number;
  viewsKind?: ViewsKind;
}

export interface DominantViewsMedian {
  /** Medyan izlenme; hesaplanabilen kısa video yoksa undefined (0 değil). */
  median?: number;
  /** Medyanın hesaplandığı tür (en sık görülen); ölçülemediyse undefined. */
  viewsKind?: ViewsKind;
  /** Medyana giren içerik sayısı. */
  n: number;
}

/** En sık görülen `viewsKind`'ın içeriği (bkz. `filterDominantViewsKind`). */
export interface DominantViewsGroup<T extends ViewsSample> {
  /** Seçilen tür; uygun içerik yoksa undefined. */
  viewsKind?: ViewsKind;
  /** Yalnız o türdeki, uygun (kısa video + ölçülmüş izlenme) içerikler; girdi sırası korunur. */
  items: T[];
}

/**
 * Uygun içerik = `short_video`, izlenmesi ölçülmüş (sonlu, ≥ 0) ve türü bilinen. En sık görülen tür seçilir; eşitlikte
 * adı alfabetik olarak önce gelen tür (deterministik). Türler karıştırılmaz: medyanlar ve saat/gün analizleri
 * (`bestPostingSlots`) yalnız bu grup üzerinde hesaplanır.
 */
export function filterDominantViewsKind<T extends ViewsSample>(items: readonly T[]): DominantViewsGroup<T> {
  const byKind = new Map<ViewsKind, T[]>();
  for (const it of items) {
    if (it.format !== "short_video" || it.viewsKind === undefined) continue;
    if (it.views === undefined || !Number.isFinite(it.views) || !(it.views >= 0)) continue;
    const group = byKind.get(it.viewsKind);
    if (group) group.push(it);
    else byKind.set(it.viewsKind, [it]);
  }
  let best: [ViewsKind, T[]] | undefined;
  for (const entry of byKind) {
    if (!best || entry[1].length > best[1].length || (entry[1].length === best[1].length && entry[0] < best[0])) best = entry;
  }
  return best ? { viewsKind: best[0], items: best[1] } : { items: [] };
}

/** Kısa videoların medyan izlenmesi, YALNIZ en sık görülen `viewsKind` içinde (`filterDominantViewsKind`). */
export function medianViewsInDominantKind(items: readonly ViewsSample[]): DominantViewsMedian {
  const { viewsKind, items: group } = filterDominantViewsKind(items);
  return viewsKind === undefined ? { n: 0 } : { median: median(group.map((it) => it.views as number)), viewsKind, n: group.length };
}
