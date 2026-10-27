import type { ReactNode } from "react";

import { MeasuredValue } from "@/components/common/measured-value";
import { QualityBadges } from "@/components/comparison/quality-badges";
import type { ComparisonRow } from "@/lib/domain/insights";
import {
  formatCompact,
  formatDecimal,
  formatDuration,
  formatNumber,
  formatPercent,
  timeZoneLabel,
} from "@/lib/format";
import { COMPARISON_METRIC_PLAIN as M, SHORT_REASON_PLAIN } from "@/lib/plain-language-results";
import { hourLabel } from "@/lib/time";

/** Karşılaştırma tablosunun bir satırı: hesap sütunlarına aynı ölçüyü basan hücre üreticisi. */
export interface MetricRow {
  id: string;
  label: string;
  /** Satır etiketinin yanındaki açıklama (ölçünün tanımı). */
  hint?: string;
  cell: (row: ComparisonRow) => ReactNode;
}

function CommonHours({ row }: { row: ComparisonRow }) {
  const hours = row.posting.commonHours;
  if (hours.length === 0) return <MeasuredValue value={undefined} shortReason={SHORT_REASON_PLAIN.noData} reason="Tarihli video yok; paylaşım saati hesaplanamadı." />;
  return (
    <ul className="flex flex-col gap-0.5 tabular">
      {hours.map((hour) => (
        <li key={hour.hour}>
          <span className="font-medium">{hourLabel(hour.hour)}</span>{" "}
          <span className="text-xs text-muted-foreground">
            {formatNumber(hour.n)} video · {formatPercent(hour.share, 0)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function HashtagSignature({ row }: { row: ComparisonRow }) {
  const { topTag, topTagVideos, topTagShare, singleUseShare } = row.hashtags;
  if (topTag === undefined && singleUseShare === undefined) {
    return <MeasuredValue value={undefined} shortReason={SHORT_REASON_PLAIN.noData} reason="Etiketli video yok; etiket alışkanlığı hesaplanamadı." />;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {topTag !== undefined ? (
        <span>
          <span className="font-medium">#{topTag}</span>{" "}
          <span className="text-xs text-muted-foreground tabular">
            <MeasuredValue value={topTagVideos} /> video ·{" "}
            <MeasuredValue value={topTagShare} format={(v) => formatPercent(v, 0)} reason="Etiketli video payı hesaplanamadı." />
          </span>
        </span>
      ) : null}
      {singleUseShare !== undefined ? (
        <span className="text-xs text-muted-foreground tabular">Tek kullanımlık etiket: {formatPercent(singleUseShare, 0)}</span>
      ) : null}
    </div>
  );
}

/**
 * Tablo satırları (kendi hesap ↔ rakipler). Saat dilimi yalnız "En sık paylaşım saatleri" etiketinde belirtilir. "Normaline göre" satırı
 * YOK: hesap kendi normaline kıyaslandığı için kendi sütunlarında hep ~1 çıkar, bilgi taşımaz (karşılaştırma tabloları aşağıdadır).
 */
export function metricRows(audienceTimeZone: string): MetricRow[] {
  return [
    {
      id: "followers",
      label: M.followers.label,
      cell: (row) => <MeasuredValue value={row.followers} format={formatCompact} shortReason={SHORT_REASON_PLAIN.noData} reason="Takipçi sayısı alınamadı." />,
    },
    { id: "videos", label: M.videos.label, hint: M.videos.hint, cell: (row) => <MeasuredValue value={row.videoCount} /> },
    {
      id: "median-views",
      label: M.medianViews.label,
      hint: M.medianViews.hint,
      cell: (row) => <MeasuredValue value={row.medianViews} format={formatCompact} shortReason={SHORT_REASON_PLAIN.noData} reason="İzlenme sayısı alınamadı." />,
    },
    {
      id: "views-per-follower",
      label: M.viewsPerFollower.label,
      hint: M.viewsPerFollower.hint,
      cell: (row) => (
        <MeasuredValue
          value={row.medianViewsPerFollower}
          format={(v) => formatPercent(v, 1)}
          shortReason={SHORT_REASON_PLAIN.noData}
          reason="Takipçi ya da izlenme sayısı ölçülemedi."
        />
      ),
    },
    {
      id: "outliers",
      label: M.outliers.label,
      hint: M.outliers.hint,
      cell: (row) => <MeasuredValue value={row.outlierCount} shortReason={SHORT_REASON_PLAIN.noData} reason="Normali hesaplanan video yok; tutan sayısı bilinmiyor." />,
    },
    {
      id: "duration",
      label: M.duration.label,
      cell: (row) => <MeasuredValue value={row.medianDurationSec} format={formatDuration} shortReason={SHORT_REASON_PLAIN.noData} reason="Süre bilgisi yok." />,
    },
    {
      id: "posts-per-week",
      label: M.postsPerWeek.label,
      hint: M.postsPerWeek.hint,
      cell: (row) => (
        <MeasuredValue value={row.posting.postsPerWeek} format={(v) => formatDecimal(v, 1)} shortReason={SHORT_REASON_PLAIN.noData} reason="En az 2 tarihli video gerekir." />
      ),
    },
    {
      id: "days-since",
      label: M.daysSince.label,
      cell: (row) => (
        <MeasuredValue
          value={row.posting.daysSinceLastPost}
          format={(v) => `${formatNumber(v)} gün`}
          shortReason={SHORT_REASON_PLAIN.noData}
          reason="Tarihli video yok."
        />
      ),
    },
    {
      id: "common-hours",
      label: `${M.commonHours.label} (${timeZoneLabel(audienceTimeZone)})`,
      hint: M.commonHours.hint,
      cell: (row) => <CommonHours row={row} />,
    },
    {
      id: "comment-cta",
      label: M.commentAsk.label,
      hint: M.commentAsk.hint,
      cell: (row) => (
        <MeasuredValue value={row.commentCtaShare} format={(v) => formatPercent(v, 0)} shortReason={SHORT_REASON_PLAIN.noData} reason="Açıklaması olan video yok." />
      ),
    },
    { id: "hashtags", label: M.hashtags.label, cell: (row) => <HashtagSignature row={row} /> },
    { id: "quality", label: M.quality.label, cell: (row) => <QualityBadges badges={row.quality} /> },
  ];
}
