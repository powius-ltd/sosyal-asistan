import { Sparkles } from "lucide-react";
import Link from "next/link";

import { AdSignalBadge } from "@/components/matrix/ad-signal-badge";
import { LiftBadge } from "@/components/common/lift-badge";
import type { CreativeMatrixCell } from "@/lib/domain/creative-matrix";
import { adCellSignalOf } from "@/lib/matrix/ad-signal";
import { matrixCellHref } from "@/lib/matrix/cell-param";
import { ANGLE_MAP_PLAIN } from "@/lib/matrix/plain";
import { opportunityText } from "@/lib/matrix/text";

/** Gösterilen en güçlü fırsat sayısı. */
export const OPPORTUNITIES_SHOWN = 5;

/**
 * "Denemediğin yaklaşımlar": rakipte tuttuğu halde kendi hesabın denemediği kutular, `compareOpportunities` sırasıyla (güven → lift → ön matris;
 * sıralama ve cümle koddan: LLM yok). Her satır kutu ayrıntısına bağlanır. Yönetici modunda "reklamda denenmedi" işareti (sıralamayı değiştirmez).
 */
export function OpportunityList({ opportunities, video, operator = false }: { opportunities: readonly CreativeMatrixCell[]; video?: string; operator?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="size-4 text-success" aria-hidden />
        {ANGLE_MAP_PLAIN.opportunities.title}
      </h3>
      {opportunities.length === 0 ? (
        <p className="text-sm text-muted-foreground">{ANGLE_MAP_PLAIN.opportunities.empty}</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-xl border">
          {opportunities.slice(0, OPPORTUNITIES_SHOWN).map((cell, index) => (
            <li key={`${cell.stage}|${cell.angle}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <Link href={matrixCellHref(cell, video)} scroll={false} className="min-w-0 py-2 hover:underline md:py-0">
                <span className="tabular mr-2 text-muted-foreground">{index + 1}.</span>
                {opportunityText(cell)}
              </Link>
              <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {/* Rakipte kanıtlı ama reklamda hiç denenmemiş kutu göze çarpar (yalnız yönetici; reklam hesabı yoksa işaret yok). */}
                {operator && cell.ads !== undefined && adCellSignalOf(cell.ads) === "untested" ? <AdSignalBadge signal="untested" /> : null}
                <LiftBadge lift={cell.rivals.medianLift} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
