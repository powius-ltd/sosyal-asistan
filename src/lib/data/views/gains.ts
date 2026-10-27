/**
 * Depo görünümleri için ortak zaman-serisi hesapları: bir aralıkta kazanılan izlenme ve bir andaki takipçi toplamı.
 * SAF (depo/saat yok): Genel bakış ve haftalık özet aynı hesabı kullanır, mock ve Supabase deposu da (kopya yok).
 */
import type { OwnAccount } from "@/lib/domain/competitor";
import type { AccountSnapshot, ContentItem, MetricSnapshot } from "@/lib/domain/content";

/** Snapshot serisinde `t` anındaki izlenme (doğrusal ara değer). İzlenme hiç ölçülmediyse undefined. */
function valueAt(snaps: MetricSnapshot[], publishedMs: number, t: number): number | undefined {
  const points = snaps
    .filter((s) => s.views !== undefined)
    .map((s) => [new Date(s.capturedAt).getTime(), s.views as number] as const);
  if (points.length === 0) return undefined;
  if (t <= publishedMs) return 0;
  let prev: readonly [number, number] = [publishedMs, 0];
  for (const p of points) {
    if (t <= p[0]) return prev[1] + ((p[1] - prev[1]) * (t - prev[0])) / Math.max(p[0] - prev[0], 1);
    prev = p;
  }
  return prev[1];
}

/** [from, to) aralığında kendi içeriklerin kazandığı izlenme; hiçbir içeriğin izlenmesi ölçülmediyse undefined. */
export function gainedViews(
  snapshotsByItem: Map<string, MetricSnapshot[]>,
  items: ContentItem[],
  from: number,
  to: number,
): number | undefined {
  let views: number | undefined;
  for (const c of items) {
    const snaps = snapshotsByItem.get(c.id) ?? [];
    const pub = c.publishedAt ? new Date(c.publishedAt).getTime() : undefined;
    if (pub === undefined) continue;
    const a = valueAt(snaps, pub, from);
    const b = valueAt(snaps, pub, to);
    if (a === undefined || b === undefined) continue;
    views = (views ?? 0) + (b - a);
  }
  return views === undefined ? undefined : Math.round(views);
}

/** Hesapların `t` anındaki (ya da öncesindeki son) takipçi toplamı; biri ölçülmemişse undefined. */
export function followersAt(snaps: AccountSnapshot[], own: OwnAccount[], t: number): number | undefined {
  let sum = 0;
  for (const a of own) {
    const last = snaps
      .filter((s) => s.subjectId === a.id && s.followers !== undefined && new Date(s.capturedAt).getTime() <= t)
      .sort((x, y) => y.capturedAt.localeCompare(x.capturedAt))[0];
    if (!last) return undefined;
    sum += last.followers as number;
  }
  return own.length > 0 ? sum : undefined;
}
