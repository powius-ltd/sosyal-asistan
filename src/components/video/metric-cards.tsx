import { Bookmark, Eye, Heart, MessageCircle, Share2, Timer, Users } from "lucide-react";
import type { ReactNode } from "react";

import { MeasuredValue } from "@/components/common/measured-value";
import { StatCard } from "@/components/common/stat-card";
import { unmeasuredReason, type MetricField } from "@/components/video/metric-reasons";
import type { ContentItem } from "@/lib/domain/content";
import { VIEWS_KIND_LABEL } from "@/lib/domain/platform";
import { formatCompact, formatDateTime, formatDuration } from "@/lib/format";

const CARDS: { field: MetricField; label: string; icon: ReactNode }[] = [
  { field: "views", label: "İzlenme", icon: <Eye /> },
  { field: "likes", label: "Beğeni", icon: <Heart /> },
  { field: "comments", label: "Yorum", icon: <MessageCircle /> },
  { field: "shares", label: "Paylaşım", icon: <Share2 /> },
  { field: "saves", label: "Kaydetme", icon: <Bookmark /> },
  { field: "reach", label: "Erişim", icon: <Users /> },
  { field: "avgWatchSec", label: "Ort. izlenme süresi", icon: <Timer /> },
];

/**
 * Metrik kartları. Ölçülemeyen değer tire + sebep gösterir (0 değil); rakipte kaydetme/erişim/izlenme
 * süresi scraping ile gelmez, sebebi ipucu balonunda yazar.
 */
export function MetricCards({ item, timeZone }: { item: ContentItem; timeZone?: string }) {
  const { metrics } = item;

  return (
    <section aria-label="Metrikler" className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {CARDS.map(({ field, label, icon }) => (
          <StatCard
            key={field}
            label={label}
            icon={icon}
            value={
              <MeasuredValue
                value={metrics[field]}
                reason={unmeasuredReason(field, item)}
                format={field === "avgWatchSec" ? formatDuration : formatCompact}
              />
            }
            hint={field === "views" && metrics.viewsKind ? VIEWS_KIND_LABEL[metrics.viewsKind] : undefined}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {metrics.capturedAt ? `Son ölçüm: ${formatDateTime(metrics.capturedAt, timeZone)}` : "Bu içerik henüz ölçülmedi."}
      </p>
    </section>
  );
}
