import { X } from "lucide-react";
import Link from "next/link";

import { LiftBadge } from "@/components/common/lift-badge";
import { ScrollToTarget } from "@/components/common/scroll-to-target";
import { MatrixSampleList } from "@/components/matrix/matrix-sample-list";
import { TOPIC_SECTION_ANCHOR } from "@/components/matrix/topic-hook-cell";
import { TOPIC_STATUS_STYLE } from "@/components/matrix/topic-cell-style";
import { topicCellTitle } from "@/components/matrix/topic-text";
import { Badge } from "@/components/ui/badge";
import type { TopicHookCell } from "@/lib/domain/topic-hook-matrix";
import { formatNumber } from "@/lib/format";
import { ANGLE_MAP_PLAIN, TOPIC_MAP_PLAIN, TOPIC_STATUS_LONG } from "@/lib/matrix/plain";
import { topicCellHref } from "@/lib/matrix/topic-cell-param";

/** Ayrıntı panelinin kimliği: sayfa bağlantıdan açılınca kaydırma ve odak buraya gelir. */
export const TOPIC_DETAIL_ID = "topic-cell-detail";

/**
 * Seçili konu kutusunun ayrıntısı (`?konu=<küme>:<hook>`): durum, iki tarafın özeti ve örnek videolar (lift'e göre, sahip + lift + içeriğe
 * bağlantı). Örnekler hücrenin içindedir (içerik başına ek okuma yok). Kutuda video yoksa söylenir. Panel açılınca sayfa buraya kayar ve odak panele gelir.
 */
export function TopicCellDetail({ cell, label, showRivals, video }: { cell: TopicHookCell; label: string; showRivals: boolean; video?: string }) {
  const { icon: Icon } = TOPIC_STATUS_STYLE[cell.status];
  const title = topicCellTitle(label, cell.hookType);
  const total = cell.own.n + cell.rivals.n;
  return (
    <section
      id={TOPIC_DETAIL_ID}
      tabIndex={-1}
      aria-label={`${ANGLE_MAP_PLAIN.detail.label}: ${title}`}
      className="flex scroll-mt-4 flex-col gap-3 rounded-xl border bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      data-testid="topic-cell-detail"
    >
      <ScrollToTarget key={`${cell.clusterKey}|${cell.hookType}`} targetId={TOPIC_DETAIL_ID} />
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Badge variant="outline" className="gap-1 bg-background/70">
              <Icon aria-hidden />
              {TOPIC_STATUS_LONG[cell.status]}
            </Badge>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              Kendi {formatNumber(cell.own.n)} {ANGLE_MAP_PLAIN.rows.videos}
              {cell.own.n > 0 ? <LiftBadge lift={cell.own.medianLift} /> : null}
            </span>
            {showRivals ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                Rakip {formatNumber(cell.rivals.n)} {ANGLE_MAP_PLAIN.rows.videos}
                {cell.rivals.n > 0 ? <LiftBadge lift={cell.rivals.medianLift} /> : null}
              </span>
            ) : null}
          </p>
        </div>
        <Link href={`${topicCellHref(undefined, video)}#${TOPIC_SECTION_ANCHOR}`} scroll={false} className="inline-flex min-h-tap items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:min-h-0">
          <X className="size-3.5" aria-hidden />
          {ANGLE_MAP_PLAIN.detail.close}
        </Link>
      </header>
      {total === 0 ? <p className="text-sm text-muted-foreground">{TOPIC_MAP_PLAIN.detail.noVideos}</p> : <MatrixSampleList samples={cell.samples} total={total} />}
    </section>
  );
}
