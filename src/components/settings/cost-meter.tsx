import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { CapProgress, CapValue } from "@/components/common/cost-cap";
import { MeasuredValue } from "@/components/common/measured-value";
import { CAP_CLOSED_NOTE, costView, SPENT_UNKNOWN_REASON } from "@/lib/cost";
import type { CostBucket } from "@/lib/domain/run";
import { formatNumber, formatPercent, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

function Figure({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tracking-tight tabular">{children}</span>
      <span className="text-[0.7rem] text-muted-foreground">{hint}</span>
    </div>
  );
}

/**
 * Bir sağlayıcı grubunun aylık harcama sayacı: harcanan (mutabık) / rezerve / tavan + ilerleme.
 * Hesap `lib/cost.ts` `costView`'dadır (görünüm kuralı tek yerde): mutabık koşu yoksa harcanan "—" + sebep; tavan 0 = harcama kapalı.
 */
export function CostMeter({ title, bucket }: { title: string; bucket: CostBucket }) {
  const { unreconciledRuns, priceUnknownRuns, runs } = bucket;
  const view = costView(bucket);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">{formatNumber(runs)} koşu</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Figure label="Harcanan" hint="mutabık koşular">
          <MeasuredValue value={view.spentUsd} format={formatUsd} reason={SPENT_UNKNOWN_REASON} />
        </Figure>
        <Figure label="Rezerve" hint="tavandan ayrılan pay">
          {formatUsd(view.reservedUsd)}
        </Figure>
        <Figure label="Tavan" hint="aylık">
          <CapValue view={view} />
        </Figure>
      </div>
      {view.ratio !== undefined ? (
        <div className="flex flex-col gap-1">
          <CapProgress view={view} label={`${title} tavan kullanımı`} />
          <span className={cn("text-xs tabular", view.level === "over" ? "text-destructive" : "text-muted-foreground")}>
            Tavana sayılan {formatUsd(view.committedUsd)} / {formatUsd(view.capUsd)} ({formatPercent(view.ratio, 0)})
          </span>
        </div>
      ) : view.capState === "closed" ? (
        <p className="text-xs text-muted-foreground">{CAP_CLOSED_NOTE}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Tavan tanımlı değil; tavana sayılan {formatUsd(view.committedUsd)}.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Mutabakat bekleyen koşu: <span className="font-medium text-foreground tabular">{formatNumber(unreconciledRuns)}</span>
      </p>
      {priceUnknownRuns > 0 ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-2 text-xs text-warning-soft-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {formatNumber(priceUnknownRuns)} koşunun fiyatı okunamadı: rezerve tutar muhafazakâr bir tahmindir,
            mutabakattan sonra gerçek tutar yazılır.
          </span>
        </p>
      ) : null}
    </div>
  );
}
