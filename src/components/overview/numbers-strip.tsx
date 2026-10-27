import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { Hint } from "@/components/common/hint";
import { MeasuredValue } from "@/components/common/measured-value";
import { kpiOf, viewsChange } from "@/lib/overview/period-change";
import type { OwnOutlierStat } from "@/lib/overview/types";
import { formatCompact, formatPercent } from "@/lib/format";
import type { Overview } from "@/lib/domain/overview";
import { OUTLIER_PLAIN } from "@/lib/plain-language";
import { cn } from "@/lib/utils";

function Tile({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 rounded-xl bg-card p-3 ring-1 ring-foreground/10", className)}>
      <span className="text-xs font-medium break-words text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tracking-tight tabular sm:text-2xl">{value}</span>
      {hint ? <span className="hidden text-xs text-muted-foreground sm:block">{hint}</span> : null}
    </div>
  );
}

/** "Son 30 gün · önceki döneme göre +%48"; oran yalnız önceki dönemde yeterli yayın varsa (`viewsChange`), aksi halde yalnız dönem. */
function viewsHint(overview: Overview): string {
  const change = viewsChange(overview);
  const percent = change === undefined ? undefined : formatPercent(Math.abs(change));
  if (change === undefined || percent === undefined) return `Son ${overview.days} gün`;
  // Yuvarlayınca %0: "%0" yazılmaz (ölçülemeyen gibi okunur), değişim yok denir.
  if (percent === "%0") return `Son ${overview.days} gün · önceki dönemle aynı`;
  return `Son ${overview.days} gün · önceki döneme göre ${change > 0 ? "+" : "−"}${percent}`;
}

interface NumbersStripProps {
  overview: Overview;
  /** Kendi tutan videoların özeti; okunamadıysa undefined (tire + sebep). */
  ownOutliers?: OwnOutlierStat;
  className?: string;
}

/**
 * Sayılar: Takipçi · İzlenme · Tutan videon (KENDİ tutanların; rakip sayılmaz). Mobilde üçlü dar şerit (yalnız etiket + değer);
 * ölçülemeyen değer tire + sebep (0 değil). Tutan sayısı yalnız izlenme ölçülmüşse sıfır olabilir; ölçülmemişse bilinmiyor.
 */
export function NumbersStrip({ overview, ownOutliers, className }: NumbersStripProps) {
  const followers = kpiOf(overview, "followers");
  const views = kpiOf(overview, "views");
  const outlierCount = ownOutliers !== undefined && (ownOutliers.count > 0 || views?.value !== undefined) ? ownOutliers.count : undefined;
  return (
    <section aria-label="Sayılar" className={cn("grid grid-cols-3 gap-2 sm:gap-4", className)}>
      <Tile
        label="Takipçi"
        value={<MeasuredValue value={followers?.value} format={formatCompact} reason={followers?.unmeasuredReason ?? "Takipçi sayısı henüz ölçülemedi."} />}
      />
      <Tile
        label="İzlenme"
        value={<MeasuredValue value={views?.value} format={formatCompact} reason={views?.unmeasuredReason ?? "İzlenme henüz ölçülemedi."} />}
        hint={viewsHint(overview)}
      />
      <Tile
        label={
          <Hint content={OUTLIER_PLAIN.sentence} label={OUTLIER_PLAIN.sentence} className="inline-flex items-center gap-1">
            Tutan videon
            <Info className="size-3 shrink-0" aria-hidden />
          </Hint>
        }
        value={<MeasuredValue value={outlierCount} reason="Videolarının izlenmesi henüz ölçülemedi." />}
        hint={`Son ${overview.days} gün`}
      />
      {/* Telefonda kart altyazıları sığmaz: dönem + değişim kartların altında tek satırdır (büyük düşüş görünmez kalmasın; D3-07). */}
      <p className="col-span-3 text-xs text-muted-foreground sm:hidden" data-testid="period-line">
        İzlenme: {viewsHint(overview)}
      </p>
    </section>
  );
}
