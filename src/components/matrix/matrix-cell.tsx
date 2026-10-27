import Link from "next/link";

import { AdCellRow, adRowVisible } from "@/components/matrix/ad-cell-row";
import { CellRow } from "@/components/matrix/cell-row";
import { PRIOR_ICON, STATUS_STYLE } from "@/components/matrix/cell-style";
import { Hint } from "@/components/common/hint";
import { LiftBadge } from "@/components/common/lift-badge";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/weekly-plan/confidence-badge";
import type { CreativeMatrixCell } from "@/lib/domain/creative-matrix";
import { formatNumber } from "@/lib/format";
import { matrixCellHref } from "@/lib/matrix/cell-param";
import { ANGLE_MAP_PLAIN, CELL_STATUS_LONG, CELL_STATUS_SHORT, priorBadgeShort, priorBadgeText, priorHint } from "@/lib/matrix/plain";
import { cellTitle } from "@/lib/matrix/text";
import { openingTypeLabel } from "@/lib/plain-language-results";
import { cn } from "@/lib/utils";

/** Beklenen uyum işareti (küçük rozet + açıklayıcı balon). Bağlantının üstünde durur: balon tıklanabilir kalır. */
function PriorMark({ cell }: { cell: CreativeMatrixCell }) {
  const { icon: Icon, filled } = PRIOR_ICON[cell.prior];
  return (
    <Hint content={<span className="block max-w-64 whitespace-normal">{priorHint(cell.prior, cell.status)}</span>} label={priorBadgeText(cell.prior)} className="relative z-10 shrink-0">
      <Badge variant="outline" className="gap-1 bg-background/70 px-1.5 font-normal" data-prior={cell.prior}>
        <Icon className={cn(filled && "fill-current")} aria-hidden />
        {priorBadgeShort(cell.prior)}
      </Badge>
    </Hint>
  );
}

/**
 * Haritadaki kutu: durum rozeti (bağlantı: ayrıntıyı açar, bütün kutuyu kaplar), rakip ve kendi özeti, beklenen uyum işareti, baskın açılış
 * tarzları; yönetici modunda reklam satırı (ikinci rozet; hücre durumunu ETKİLEMEZ). Normaline göre sonuç ölçülemediyse `LiftBadge` tire + sebep gösterir (0 değil). Boş kutuda yalnız durum + beklenen uyum yazılır.
 */
export function MatrixCell({ cell, selected, video, operator = false }: { cell: CreativeMatrixCell; selected: boolean; video?: string; operator?: boolean }) {
  const { icon: Icon, cell: tone } = STATUS_STYLE[cell.status];
  const { rivals, own } = cell;
  const hasVideos = rivals.n + own.n > 0;
  const { rows } = ANGLE_MAP_PLAIN;
  return (
    <div className={cn("relative flex h-full min-h-32 flex-col gap-2 rounded-lg border p-2.5 text-xs", tone, selected && "ring-2 ring-primary ring-offset-1 ring-offset-background")} data-status={cell.status} data-selected={selected || undefined}>
      <div className="flex flex-wrap items-start justify-between gap-1.5">
        <Link
          href={matrixCellHref(cell, video)}
          scroll={false}
          aria-current={selected ? "true" : undefined}
          aria-label={`${cellTitle(cell)}: ${CELL_STATUS_LONG[cell.status]}. ${ANGLE_MAP_PLAIN.detail.open}`}
          className="inline-flex min-h-tap min-w-0 items-start gap-1 text-[0.8rem] leading-tight font-semibold outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring md:min-h-0"
        >
          <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{CELL_STATUS_SHORT[cell.status]}</span>
        </Link>
        <PriorMark cell={cell} />
      </div>

      {hasVideos || (operator && adRowVisible(cell.ads, hasVideos)) ? (
        <dl className="flex flex-col gap-1.5">
          <CellRow label={rows.rivals}>
            <span className="tabular">{formatNumber(rivals.n)} {rows.videos}</span>
            {rivals.n > 0 ? <LiftBadge lift={rivals.medianLift} className="relative z-10" /> : null}
            {rivals.liftN > 0 ? <span className="tabular">{formatNumber(rivals.outlierCount)} {rows.outliers}</span> : null}
            {rivals.n > 0 ? <ConfidenceBadge level={rivals.confidence} sampleSize={rivals.liftN} lowBaselineShare={rivals.lowBaselineShare} className="relative z-10" /> : null}
          </CellRow>
          <CellRow label={rows.you}>
            {own.n > 0 ? (
              <>
                <span className="tabular">{formatNumber(own.n)} {rows.videos}</span>
                <span className="font-medium">{rows.tried}</span>
                <LiftBadge lift={own.medianLift} className="relative z-10" />
              </>
            ) : (
              <span className="font-medium">{rows.notTried}</span>
            )}
          </CellRow>
          {cell.topHookTypes.length > 0 ? (
            <CellRow label={rows.opening}>
              <span className="min-w-0">{cell.topHookTypes.map((h) => `${openingTypeLabel(h.hookType)}${h.n > 1 ? ` (${formatNumber(h.n)})` : ""}`).join(" · ")}</span>
            </CellRow>
          ) : null}
          {operator && adRowVisible(cell.ads, hasVideos) ? <AdCellRow ads={cell.ads} /> : null}
        </dl>
      ) : null}
    </div>
  );
}
