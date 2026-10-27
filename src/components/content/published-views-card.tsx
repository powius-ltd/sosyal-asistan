import { ChartScatter } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import {
  buildPublishedViewsData,
  TIER_DOT,
  tierLegendLabel,
  UNMEASURED_DOT,
} from "@/components/content/published-views";
import { PublishedViewsChart } from "@/components/content/published-views-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContentItem, LiftTier } from "@/lib/domain/content";
import { formatNumber } from "@/lib/format";
import { CONTENT_PLAIN } from "@/lib/plain-language-publish";
import { cn } from "@/lib/utils";

const TIERS: readonly LiftTier[] = [0, 1, 2, 3, 4];

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label={CONTENT_PLAIN.legendLabel}>
      {TIERS.map((tier) => (
        <li key={tier} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", TIER_DOT[tier])} aria-hidden />
          {tierLegendLabel(tier)}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className={cn("size-2.5 rounded-full", UNMEASURED_DOT)} aria-hidden />
        {CONTENT_PLAIN.legendUnmeasured}
      </li>
    </ul>
  );
}

/**
 * İçeriklerim: yayın tarihine göre izlenme. Geçmiş ölçüm (zaman serisi) henüz olmadığından her nokta bir video; tek
 * ölçüm noktalı seri yerine bu, hesabın hangi videosunun ne kadar izlendiğini ve ne sıklıkla paylaşıldığını gösterir.
 */
export function PublishedViewsCard({ items, timeZone }: { items: ContentItem[]; timeZone?: string }) {
  const { points, excluded } = buildPublishedViewsData(items);

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Yayın tarihine göre izlenme</CardTitle>
        <CardDescription>
          {CONTENT_PLAIN.chartDescription}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {points.length === 0 ? (
          <EmptyState
            icon={ChartScatter}
            title="Grafik çizilemiyor"
            description="Bu filtredeki hiçbir videonun yayın tarihi ve izlenmesi birlikte ölçülemedi."
          />
        ) : (
          <>
            <PublishedViewsChart points={points} timeZone={timeZone} />
            <Legend />
          </>
        )}
        {excluded > 0 ? (
          <p className="text-xs text-muted-foreground">
            {formatNumber(excluded)} içerik grafikte yok: yayın tarihi ya da izlenmesi ölçülemedi.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
