import { MeasuredValue } from "@/components/common/measured-value";
import { hourRangeLabel, weekdayName } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BEST_TIMES_LIMIT, BEST_TIMES_LOOKBACK_DAYS, type BestTime } from "@/lib/domain/overview";
import { formatCompact, formatNumber } from "@/lib/format";
import { BEST_SLOT_MIN_POSTS } from "@/lib/metrics";

export interface BestTimesCardProps {
  /** `Overview.bestTimes`; undefined = ölçülemedi (yeterli veri yok). */
  bestTimes?: BestTime[];
  /** Workspace saat dilimi (dilimler bu saat diliminde; kartta belirtilir). */
  timeZone: string;
  /** `Overview.bestTimesUnmeasuredReason`: bestTimes undefined iken sebep. */
  unmeasuredReason?: string;
}

/** Çubuk genişliği (%): en iyi dilim tam, diğerleri tipik izlenmeye orantılı; ölçülemeyen dilimde çubuk yok. */
function barPercent(slot: BestTime, max: number | undefined): number | undefined {
  if (slot.medianViews === undefined || max === undefined || max <= 0) return undefined;
  return Math.max(Math.round((slot.medianViews / max) * 100), 4);
}

/**
 * "En iyi paylaşım saatleri" (Ayrıntılar): kendi kısa videolarının tipik izlenmesine göre en iyi 3 gün × saat dilimi, workspace saat
 * diliminde. Ölçülemeyen değer `MeasuredValue` ile (tire + sebep), asla "0" değil; hiç dilim yoksa tek satırlık açıklama (büyük boş
 * durum değil): neden hesaplanamadığı yazılır.
 */
export function BestTimesCard({ bestTimes, timeZone, unmeasuredReason }: BestTimesCardProps) {
  const slots = bestTimes?.slice(0, BEST_TIMES_LIMIT) ?? [];
  const measuredViews = slots.flatMap((slot) => (slot.medianViews === undefined ? [] : [slot.medianViews]));
  const max = measuredViews.length > 0 ? Math.max(...measuredViews) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>En iyi paylaşım saatleri</CardTitle>
        <CardDescription>
          Son {BEST_TIMES_LOOKBACK_DAYS} günde, aynı gün ve saatte en az {BEST_SLOT_MIN_POSTS} video paylaştığın dilimler; tipik izlenmeye göre ·
          saat dilimi {timeZone}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            En iyi saat henüz hesaplanamadı. {unmeasuredReason ?? `Bir dilim için aynı gün ve saatte en az ${BEST_SLOT_MIN_POSTS} kısa video gerekir.`}
          </p>
        ) : (
          <ol className="flex flex-col gap-3 text-sm" aria-label="En iyi paylaşım dilimleri">
            {slots.map((slot, index) => {
              const percent = barPercent(slot, max);
              return (
                <li key={`${slot.weekday}-${slot.hour}`} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="font-medium">
                      <span className="mr-2 text-muted-foreground tabular">{index + 1}.</span>
                      {weekdayName(slot.weekday) ?? "—"} · {hourRangeLabel(slot.hour)}
                    </span>
                    <span className="text-muted-foreground">
                      <MeasuredValue value={slot.medianViews} format={formatCompact} reason="Bu dilimin izlenmesi ölçülemedi." /> tipik izlenme ·{" "}
                      {formatNumber(slot.n)} video
                    </span>
                  </div>
                  {percent !== undefined ? (
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${percent}%` }} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
