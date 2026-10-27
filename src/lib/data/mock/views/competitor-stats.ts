/**
 * Mock görünümü: rakip özet istatistikleri (`Competitor.followersDelta7d/medianViews/outlierCount/postsPerWeek`).
 * Toplanan içerikten ve hesap snapshot'larından bir kez hesaplanıp rakip kaydına yazılır. Hesaplama
 * `lib/metrics`'tedir (medyan, kadans); burada yalnız gruplama ve alan eşlemesi var.
 *
 * Kural: ölçülemeyen alan undefined kalır (0 yazılmaz): içerik yoksa/skorsuzsa/tarihsizse ya da
 * snapshot çifti yoksa ilgili istatistik hiç yazılmaz.
 */
import type { Competitor } from "@/lib/domain/competitor";
import { OUTLIER_MIN_TIER, type AccountSnapshot, type ContentItem } from "@/lib/domain/content";
import { computeCadence, medianViewsInDominantKind } from "@/lib/metrics";
import { DAY_MS } from "@/lib/time";

/** Paylaşım sıklığı için gereken en az tarihli içerik. */
const MIN_DATED_FOR_CADENCE = 3;
/** "7 gün" karşılaştırması: son ölçümden en az bu kadar gün önceki en yeni ölçüm (haftalık toplamada 7 gün arayla gelir). */
const MIN_DELTA_GAP_DAYS = 6;

function followersDelta(snapshots: AccountSnapshot[]): number | undefined {
  const measured = snapshots
    .filter((s) => s.followers !== undefined)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const latest = measured[0];
  if (!latest) return undefined;
  const cutoff = new Date(latest.capturedAt).getTime() - MIN_DELTA_GAP_DAYS * DAY_MS;
  const base = measured.find((s) => new Date(s.capturedAt).getTime() <= cutoff);
  return base ? (latest.followers as number) - (base.followers as number) : undefined;
}

function postsPerWeek(items: ContentItem[]): number | undefined {
  const dated = items.filter((c) => c.publishedAt !== undefined && !Number.isNaN(new Date(c.publishedAt).getTime()));
  if (dated.length < MIN_DATED_FOR_CADENCE) return undefined;
  return computeCadence(dated.map((c) => ({ id: c.id, format: c.format, publishedAt: new Date(c.publishedAt as string) }))).postsPerWeek;
}

/** Rakip kayıtlarına istatistik alanlarını yazar (yerinde). */
export function applyCompetitorStats(competitors: Competitor[], items: ContentItem[], accountSnapshots: AccountSnapshot[]): void {
  for (const competitor of competitors) {
    const own = items.filter((c) => c.owner.kind === "competitor" && c.owner.id === competitor.id);
    const tiers = own.map((c) => c.score.liftTier).filter((t): t is NonNullable<typeof t> => t !== undefined);
    const snapshots = accountSnapshots.filter((s) => s.subjectKind === "competitor" && s.subjectId === competitor.id);

    competitor.followersDelta7d = followersDelta(snapshots);
    // Yalnız kısa videolar ve rakibin en sık görülen viewsKind'ı (türler ve formatlar karışmaz).
    competitor.medianViews = medianViewsInDominantKind(
      own.map((c) => ({ format: c.format, views: c.metrics.views, viewsKind: c.metrics.viewsKind })),
    ).median;
    competitor.outlierCount = tiers.length === 0 ? undefined : tiers.filter((t) => t >= OUTLIER_MIN_TIER).length;
    competitor.postsPerWeek = postsPerWeek(own);
  }
}
