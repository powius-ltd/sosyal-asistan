import Link from "next/link";
import type { ReactNode } from "react";

import { ConfidenceBadge } from "@/components/weekly-plan/confidence-badge";
import { LiftBadge } from "@/components/common/lift-badge";
import { TOPIC_STATUS_STYLE } from "@/components/matrix/topic-cell-style";
import { topicCellTitle } from "@/components/matrix/topic-text";
import type { TopicHookCell } from "@/lib/domain/topic-hook-matrix";
import type { CreativeCellStat } from "@/lib/domain/creative-matrix";
import { formatNumber } from "@/lib/format";
import { ANGLE_MAP_PLAIN, TOPIC_STATUS_LONG, TOPIC_STATUS_SHORT } from "@/lib/matrix/plain";
import { topicCellHref } from "@/lib/matrix/topic-cell-param";
import { cn } from "@/lib/utils";

/** Bağlantının sayfa içi çapası: karma hesapta (iki harita alt alta) seçim sonrası konu bölümüne iner. */
export const TOPIC_SECTION_ANCHOR = "topic-matrix-title";

function Side({ label, stat, children }: { label: string; stat: CreativeCellStat; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <dt className="w-10 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="tabular">{formatNumber(stat.n)} {ANGLE_MAP_PLAIN.rows.videos}</span>
        <LiftBadge lift={stat.medianLift} className="relative z-10" />
        {stat.liftN > 0 ? <span className="tabular">{formatNumber(stat.outlierCount)} {ANGLE_MAP_PLAIN.rows.outliers}</span> : null}
        {children}
      </dd>
    </div>
  );
}

/**
 * Konu ve açılış haritasındaki kutu: durum rozeti (bağlantı: ayrıntıyı açar, bütün kutuyu kaplar), kendi ve rakip özeti (video sayısı, normaline göre,
 * tutan sayısı). `showRivals = false` (izlenen rakip hiç yok) rakip satırını hiç yazmaz. Boş kutuda yalnız durum yazılır; normaline göre ölçülemediyse
 * `LiftBadge` tire + sebep gösterir (0 değil).
 */
export function TopicHookCellView({ cell, label, selected, showRivals, video }: { cell: TopicHookCell; label: string; selected: boolean; showRivals: boolean; video?: string }) {
  const { icon: Icon, cell: tone } = TOPIC_STATUS_STYLE[cell.status];
  const hasVideos = cell.own.n + cell.rivals.n > 0;
  const statusText = TOPIC_STATUS_SHORT[cell.status];
  return (
    <div
      className={cn("relative flex h-full min-h-20 flex-col gap-1.5 rounded-lg border p-2 text-xs", tone, selected && "ring-2 ring-primary ring-offset-1 ring-offset-background")}
      data-status={cell.status}
      data-selected={selected || undefined}
    >
      <Link
        href={`${topicCellHref({ clusterKey: cell.clusterKey, hookType: cell.hookType }, video)}#${TOPIC_SECTION_ANCHOR}`}
        scroll={false}
        aria-current={selected ? "true" : undefined}
        aria-label={`${topicCellTitle(label, cell.hookType)}: ${TOPIC_STATUS_LONG[cell.status]}. ${ANGLE_MAP_PLAIN.detail.open}`}
        className="inline-flex min-h-tap min-w-0 items-start gap-1 text-[0.8rem] leading-tight font-semibold outline-none md:min-h-0 after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
      >
        <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>{statusText}</span>
      </Link>
      {hasVideos ? (
        <dl className="flex flex-col gap-1">
          {cell.own.n > 0 ? (
            <Side label={ANGLE_MAP_PLAIN.rows.you} stat={cell.own}>
              <ConfidenceBadge level={cell.own.confidence} sampleSize={cell.own.liftN} lowBaselineShare={cell.own.lowBaselineShare} className="relative z-10" />
            </Side>
          ) : (
            <div className="flex items-center gap-1.5">
              <dt className="w-10 shrink-0 text-muted-foreground">{ANGLE_MAP_PLAIN.rows.you}</dt>
              <dd className="font-medium">{ANGLE_MAP_PLAIN.rows.notTried}</dd>
            </div>
          )}
          {showRivals && cell.rivals.n > 0 ? <Side label={ANGLE_MAP_PLAIN.rows.rivals} stat={cell.rivals} /> : null}
        </dl>
      ) : null}
    </div>
  );
}
