/**
 * Kontrol noktaları (D+1/3/7): bir Reels'in `metric_snapshots` ölçümlerinden TÜRETİLİR (yeni tablo yok).
 *
 * Pencere = yayın anı + `CHECKPOINT_WINDOW_DAYS` (D+1 [1,2], D+3 [3,5], D+7 [7,10] gün; iki ucu da dahil, ardışık pencereler
 * ayrıktır). Pencere içindeki İLK ölçüm noktayı doldurur. Durum: measured · due (pencere açık, ölçüm yok) · upcoming (pencere
 * açılmadı) · missed (pencere kapandı, ölçüm yok: "zamanında ölçülmedi", 0 DEĞİL).
 *
 * D+1/D+3: yalnız ham izlenme + izlenme/takipçi. Lift/kademe YALNIZ D+7: olgunlaşmamış izlenme olgun baz çizgisiyle
 * kıyaslanmaz. Ölçülemeyen değer `undefined`'dır (0 değil), sebebi `reason`'dadır. Saf fonksiyon; saat `now` parametresidir.
 */
import { liftTierFor } from "@/lib/domain/content";
import { CHECKPOINT_DAYS, CHECKPOINT_WINDOW_DAYS, type Checkpoint, type CheckpointDay } from "@/lib/domain/outcomes";
import type { ViewsKind } from "@/lib/platforms/types";
import { DAY_MS } from "@/lib/time";

/** Bir ölçüm anı. `views` undefined = o ölçümde izlenme ölçülemedi (noktayı DOLDURMAZ). */
export interface SnapshotPoint {
  capturedAt: string;
  views?: number;
  viewsKind?: ViewsKind;
  /** Ölçüm anındaki sahip takipçi sayısı (bilinmiyorsa undefined). */
  ownerFollowers?: number;
}

export interface CheckpointInput {
  /** Yayın anı (ISO); bilinmiyorsa pencere hesaplanamaz → nokta listesi boş. */
  publishedAt: string | undefined;
  snapshots: readonly SnapshotPoint[];
  /** Ölçümde takipçi yoksa yedek (hesabın güncel takipçisi). */
  followers?: number;
  /** İçeriğin baz çizgisi (D+7 lift'in paydası) ve ölçüldüğü views türü. */
  baselineViews?: number;
  baselineViewsKind?: ViewsKind;
  now: Date;
}

/** Yayın anından pencere sınırları (ms). Geçersiz yayın anı → undefined. */
export function checkpointWindowMs(publishedAt: string | undefined, day: CheckpointDay): { start: number; end: number } | undefined {
  const published = publishedAt === undefined ? Number.NaN : Date.parse(publishedAt);
  if (Number.isNaN(published)) return undefined;
  const { from, to } = CHECKPOINT_WINDOW_DAYS[day];
  return { start: published + from * DAY_MS, end: published + to * DAY_MS };
}

function lift7(views: number, input: CheckpointInput, kind: ViewsKind | undefined): { lift?: number; reason?: string } {
  const { baselineViews, baselineViewsKind } = input;
  if (baselineViews === undefined || !Number.isFinite(baselineViews) || baselineViews <= 0) return { reason: "baz çizgisi yok (lift hesaplanamadı)" };
  if (baselineViewsKind === undefined || kind === undefined || baselineViewsKind !== kind) {
    return { reason: "izlenme türü baz çizgisiyle doğrulanamadı (lift hesaplanamadı)" };
  }
  return { lift: views / baselineViews };
}

/** Üç kontrol noktası (D+1, D+3, D+7). Yayın anı bilinmiyorsa boş liste (nokta kuramazsın, 0 yazma). */
export function buildCheckpoints(input: CheckpointInput): Checkpoint[] {
  const nowMs = input.now.getTime();
  const points = input.snapshots
    .map((snapshot) => ({ snapshot, at: Date.parse(snapshot.capturedAt) }))
    .filter((p) => !Number.isNaN(p.at) && p.snapshot.views !== undefined && Number.isFinite(p.snapshot.views))
    .sort((a, b) => a.at - b.at);

  const result: Checkpoint[] = [];
  for (const day of CHECKPOINT_DAYS) {
    const window = checkpointWindowMs(input.publishedAt, day);
    if (window === undefined) return [];
    const base = { day, windowStart: new Date(window.start).toISOString(), windowEnd: new Date(window.end).toISOString() };

    const hit = points.find((p) => p.at >= window.start && p.at <= window.end);
    if (hit === undefined) {
      if (nowMs < window.start) result.push({ ...base, status: "upcoming", reason: "ölçüm penceresi henüz açılmadı" });
      else if (nowMs <= window.end) result.push({ ...base, status: "due", reason: "ölçüm penceresi açık, ölçüm yok" });
      else result.push({ ...base, status: "missed", reason: "zamanında ölçülmedi" });
      continue;
    }

    const views = hit.snapshot.views as number;
    const followers = hit.snapshot.ownerFollowers ?? input.followers;
    const reasons: string[] = [];
    const viewsPerFollower = followers !== undefined && Number.isFinite(followers) && followers > 0 ? views / followers : undefined;
    if (viewsPerFollower === undefined) reasons.push("takipçi sayısı bilinmiyor");

    let lift: number | undefined;
    if (day === 7) {
      const computed = lift7(views, input, hit.snapshot.viewsKind);
      lift = computed.lift;
      if (computed.reason) reasons.push(computed.reason);
    }
    result.push({
      ...base,
      status: "measured",
      capturedAt: new Date(hit.at).toISOString(),
      views,
      viewsPerFollower,
      lift,
      liftTier: liftTierFor(lift),
      reason: reasons.length > 0 ? reasons.join("; ") : undefined,
    });
  }
  return result;
}
