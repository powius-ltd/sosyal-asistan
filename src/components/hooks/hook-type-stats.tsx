import Link from "next/link";

import { LiftBadge } from "@/components/common/lift-badge";
import { buildHookHref, type HookUiState } from "@/components/hooks/search-params";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HookTypeStat } from "@/lib/domain/hook-library";
import { formatNumber } from "@/lib/format";
import { openingTypeLabel, OPENINGS_PLAIN, VS_NORMAL } from "@/lib/plain-language-results";
import { cn } from "@/lib/utils";

const ROW_GRID = "grid grid-cols-[minmax(6rem,10rem)_1fr_3rem_5rem] items-center gap-3";

/**
 * Açılış tarzı istatistikleri (kütüphanenin tamamı, süzgeçsiz): tarz, adet (yatay çubuk) ve normaline göre tipik sonuç. Her satır o
 * tarzı süzen bağlantıdır (seçili tarza tekrar tıklamak süzgeci kaldırır). Sıra depodan gelir (tipik sonuç azalan).
 */
export function HookTypeStats({ stats, state }: { stats: HookTypeStat[]; state: HookUiState }) {
  const maxCount = Math.max(...stats.map((stat) => stat.count), 1);

  return (
    <Card size="sm" className="mb-4">
      <CardHeader>
        <CardTitle>{OPENINGS_PLAIN.stats.title}</CardTitle>
        <CardDescription>{OPENINGS_PLAIN.stats.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={cn(ROW_GRID, "px-2 pb-1 text-xs font-medium text-muted-foreground")} aria-hidden>
          <span>{OPENINGS_PLAIN.stats.style}</span>
          <span />
          <span className="text-right">{OPENINGS_PLAIN.stats.count}</span>
          <span className="text-right">{VS_NORMAL.column}</span>
        </div>
        <ul className="flex flex-col">
          {stats.map((stat) => {
            const active = state.hookType === stat.hookType;
            const label = openingTypeLabel(stat.hookType);
            return (
              <li key={stat.hookType}>
                <Link
                  href={buildHookHref({ ...state, hookType: active ? undefined : stat.hookType })}
                  aria-current={active ? "true" : undefined}
                  title={active ? OPENINGS_PLAIN.stats.clear : OPENINGS_PLAIN.stats.filterBy(label)}
                  className={cn(ROW_GRID, "min-h-tap rounded-md px-2 py-1.5 text-sm hover:bg-muted md:min-h-0", active && "bg-muted font-medium")}
                >
                  <span className="truncate">{label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(stat.count / maxCount) * 100}%` }} />
                  </span>
                  <span className="tabular text-right text-muted-foreground">{formatNumber(stat.count)}</span>
                  <span className="flex justify-end">
                    <LiftBadge lift={stat.medianLift} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
