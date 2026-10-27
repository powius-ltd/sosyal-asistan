import { ExternalLink, Flame } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { LiftBadge } from "@/components/common/lift-badge";
import { MeasuredValue } from "@/components/common/measured-value";
import { contentTitle } from "@/components/content/content-title";
import { linkButtonClass } from "@/components/content/link-button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContentItem } from "@/lib/domain/content";
import { formatDate } from "@/lib/format";
import { OUTLIER_PLAIN } from "@/lib/plain-language";
import { ROUTES } from "@/lib/routes";
import { safeExternalUrl } from "@/lib/safe-url";
import { cn } from "@/lib/utils";

/** Genel bakışta gösterilen en çok tutan video (tamamı `/tutanlar`'da). */
export const RECENT_OUTLIERS_LIMIT = 3;

interface RecentOutliersProps {
  items: ContentItem[];
  days: number;
  timeZone?: string;
  className?: string;
}

/**
 * "Son tutan videolar": kendi + rakip, normalinin en az 3 katı izlenenler. Satırın tamamı videonun analiz sayfasına bağlıdır
 * (dokunma alanı satırın tümü); platformdaki videoya giden simge ayrıca ≥ 44 px dokunma alanındadır. "Tümü" → `/tutanlar`.
 */
export function RecentOutliers({ items, days, timeZone, className }: RecentOutliersProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Son tutan videolar</CardTitle>
        <CardDescription>Son {days} günde {OUTLIER_PLAIN.definition}: kendi videoların ve rakiplerinki.</CardDescription>
        <CardAction>
          <Link href={ROUTES.outliers} className={cn(linkButtonClass("ghost"), "h-tap px-3")}>
            Tümü
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState icon={Flame} title="Bu dönemde tutan video yok" description={`${OUTLIER_PLAIN.sentence} Olunca burada listelenir.`} className="py-6" />
        ) : (
          <ul className="divide-y">
            {items.slice(0, RECENT_OUTLIERS_LIMIT).map((item) => {
              const externalUrl = safeExternalUrl(item.url);
              return (
                <li key={item.id} className="relative flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <LiftBadge {...item.score} className="shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link href={ROUTES.video(item.id)} className="truncate font-medium after:absolute after:inset-0 hover:underline">
                      {contentTitle(item, 60)}
                    </Link>
                    <span className="truncate text-xs text-muted-foreground">
                      @{item.owner.handle} · {item.owner.kind === "own" ? "Kendi videon" : "Rakip"} ·{" "}
                      <MeasuredValue value={formatDate(item.publishedAt, timeZone)} reason="Yayın tarihi platformdan alınamadı." />
                    </span>
                  </div>
                  {externalUrl ? (
                    <a
                      href={externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Platformda aç"
                      className="relative z-10 -m-3.5 shrink-0 p-3.5 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-4" aria-hidden />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
