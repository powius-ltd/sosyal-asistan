import { X } from "lucide-react";
import Link from "next/link";

import { AdCellDetail } from "@/components/matrix/ad-cell-detail";
import { ScrollToTarget } from "@/components/common/scroll-to-target";
import { STATUS_STYLE } from "@/components/matrix/cell-style";
import { MatrixSampleList } from "@/components/matrix/matrix-sample-list";
import { Badge } from "@/components/ui/badge";
import type { CreativeMatrixCell } from "@/lib/domain/creative-matrix";
import { formatNumber } from "@/lib/format";
import { matrixCellHref } from "@/lib/matrix/cell-param";
import { ANGLE_MAP_PLAIN, CELL_STATUS_LONG, PRIOR_LABEL, PRIOR_LEVEL_PLAIN } from "@/lib/matrix/plain";
import { cellTitle } from "@/lib/matrix/text";
import { openingTypeLabel } from "@/lib/plain-language-results";

/** Ayrıntı panelinin kimliği: sayfa bağlantıdan açılınca kaydırma ve odak buraya gelir. */
export const CELL_DETAIL_ID = "matrix-cell-detail";

/**
 * Seçili kutunun ayrıntısı (`?hucre=`): durum, beklenen uyum, örnek videolar (normaline göre; sahip + sonuç + içeriğe bağlantı) ve açılış tarzı
 * dağılımı. Örnekler `matrix.cells[i].samples` içindedir (içerik başına ek okuma yok). Kutuda video yoksa söylenir. Panel açılınca (bağlantıdan ya
 * da kutuya basınca) sayfa buraya kayar ve odak panele gelir (`ScrollToTarget`). Yönetici modunda reklam bölümü (`AdCellDetail`) eklenir.
 */
export function CellDetail({ cell, video, operator = false }: { cell: CreativeMatrixCell; video?: string; operator?: boolean }) {
  const { icon: Icon } = STATUS_STYLE[cell.status];
  const total = cell.own.n + cell.rivals.n;
  const { detail } = ANGLE_MAP_PLAIN;
  return (
    <section
      id={CELL_DETAIL_ID}
      tabIndex={-1}
      aria-label={`${detail.label}: ${cellTitle(cell)}`}
      className="flex scroll-mt-4 flex-col gap-3 rounded-xl border bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      data-testid="matrix-cell-detail"
    >
      <ScrollToTarget key={`${cell.stage}|${cell.angle}`} targetId={CELL_DETAIL_ID} />
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{cellTitle(cell)}</h3>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline" className="gap-1 bg-background/70">
              <Icon aria-hidden />
              {CELL_STATUS_LONG[cell.status]}
            </Badge>
            <span className="text-muted-foreground">
              {PRIOR_LABEL}: {PRIOR_LEVEL_PLAIN[cell.prior]}
            </span>
            <span className="text-muted-foreground">· {detail.rivalsAndOwn(formatNumber(cell.rivals.n) ?? "0", formatNumber(cell.own.n) ?? "0")}</span>
          </p>
        </div>
        <Link href={matrixCellHref(undefined, video)} scroll={false} className="inline-flex min-h-tap items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:min-h-0">
          <X className="size-3.5" aria-hidden />
          {detail.close}
        </Link>
      </header>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">{detail.noVideos}</p>
      ) : (
        <>
          {cell.topHookTypes.length > 0 ? (
            <p className="text-sm">
              <span className="text-muted-foreground">{detail.openings}</span>
              {cell.topHookTypes.map((h) => `${openingTypeLabel(h.hookType)} (${formatNumber(h.n)})`).join(" · ")}
            </p>
          ) : null}
          <MatrixSampleList samples={cell.samples} total={total} />
        </>
      )}
      {/* Reklam bölümü yalnız yönetici modunda; kutuda video olmasa da reklam denenmiş olabilir. */}
      {operator ? <AdCellDetail cell={cell} /> : null}
    </section>
  );
}
