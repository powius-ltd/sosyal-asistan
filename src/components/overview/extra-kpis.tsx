import { Activity, Clapperboard, Flame, Users } from "lucide-react";
import type { ReactNode } from "react";

import { MeasuredValue } from "@/components/common/measured-value";
import { StatCard } from "@/components/common/stat-card";
import { changeBetween, trendChange, type Change } from "@/components/overview/trend-math";
import type { Kpi, Overview } from "@/lib/domain/overview";
import { formatPercent } from "@/lib/format";
import { kpiOf, postsChange } from "@/lib/overview/period-change";
import { OUTLIER_PLAIN, PLAIN_TERMS } from "@/lib/plain-language";
import { isMeasured } from "@/lib/domain/measured";
import { cn } from "@/lib/utils";

/** "Tipik etkileşim oranı": düz dil sözlüğündeki "medyan" karşılığı, cümle başı büyük harfle. */
const ENGAGEMENT_LABEL_LEAD = PLAIN_TERMS.median.say.replace(/^./u, (first) => first.toLocaleUpperCase("tr-TR"));

const DIRECTION_TEXT = { [-1]: "text-danger", 0: "text-muted-foreground", 1: "text-success" } as const;

function KpiValue({ kpi, format }: { kpi: Kpi | undefined; format?: (value: number) => ReactNode }) {
  return <MeasuredValue value={kpi?.value} reason={kpi?.unmeasuredReason ?? "Bu gösterge şu an sağlanmıyor."} format={format} />;
}

function ChangeLine({ label, change }: { label: string; change: Change }) {
  return (
    <span className="flex items-center gap-1">
      <span>{label}:</span>
      <MeasuredValue measured={change.text} className={cn("font-medium", DIRECTION_TEXT[change.direction])} />
    </span>
  );
}

/** "Son 30 gün" + önceki döneme göre değişim; oran yalnız önceki dönemde ≥ 3 yayın varsa (`postsChange`). */
function PostsHint({ overview }: { overview: Overview }) {
  const change = postsChange(overview);
  const percent = change === undefined ? undefined : formatPercent(Math.abs(change));
  if (change === undefined || percent === undefined) return <>Son {overview.days} gün</>;
  // Yuvarlayınca %0: "%0" yazılmaz, değişim yok denir.
  if (percent === "%0") return <>Son {overview.days} gün · önceki dönemle aynı</>;
  return (
    <span>
      Son {overview.days} gün · önceki döneme göre {change > 0 ? "+" : "−"}
      {percent}
    </span>
  );
}

/**
 * Izgara kart sayısına göre kurulur: 4 kart geniş ekranda tek satır (dört sütun), 3 kart üç sütun; dar / orta ekranda tek kalan kart
 * tam genişliği alır (ikinci satırda sağı boş tek kart kalmaz; D3-20).
 */
export function kpiGridClass(count: number): string {
  const lone = "sm:[&>*:last-child:nth-child(odd)]:col-span-2";
  if (count >= 4) return `grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${lone}`;
  if (count === 3) return `grid gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:[&>*:last-child:nth-child(odd)]:col-span-1 ${lone}`;
  return "grid gap-4 sm:grid-cols-2";
}

/**
 * "Ayrıntılar" içindeki sayılar: Genel bakışın üç ana sayısı dışında kalanlar. Takipçi değişimi yalnız ölçülebiliyorsa çizilir
 * (iki yönde de "—" olan kart gürültüdür); rakiplerde tutan video yalnız ölçülmüşse.
 */
export function ExtraKpis({ overview }: { overview: Overview }) {
  const followers = kpiOf(overview, "followers");
  const followerSeries = overview.trends.find((series) => series.key === "followers");
  const change7 = trendChange(followerSeries?.points, 7);
  const change30 = changeBetween(followers?.value, followers?.previous, `Son ${overview.days} gün için önceki dönem takipçi değeri yok; değişim hesaplanamadı.`);
  const showFollowerChange = isMeasured(change7.text) || isMeasured(change30.text);
  const primaryChange = isMeasured(change30.text) ? change30 : change7;
  const rivalOutliers = kpiOf(overview, "outliers");

  const cardCount = 2 + (rivalOutliers?.value !== undefined ? 1 : 0) + (showFollowerChange ? 1 : 0);

  return (
    <div className={kpiGridClass(cardCount)} data-testid="extra-kpis">
      <StatCard
        label={`${ENGAGEMENT_LABEL_LEAD} etkileşim oranı`}
        icon={<Activity />}
        value={<KpiValue kpi={kpiOf(overview, "engagement_rate")} format={(value) => formatPercent(value)} />}
        hint={`Son ${overview.days} gün: videolarının beğeni + yorum toplamının takipçiye oranı (ortadaki değer)`}
      />
      <StatCard label="Yayın sayısı" icon={<Clapperboard />} value={<KpiValue kpi={kpiOf(overview, "posts")} />} hint={<PostsHint overview={overview} />} />
      {rivalOutliers?.value !== undefined ? (
        <StatCard
          label="Rakiplerde tutan video"
          icon={<Flame />}
          value={<KpiValue kpi={rivalOutliers} />}
          hint={`Son ${overview.days} gün, ${OUTLIER_PLAIN.definition}`}
        />
      ) : null}
      {showFollowerChange ? (
        <StatCard
          label="Takipçi değişimi"
          icon={<Users />}
          value={<MeasuredValue measured={primaryChange.text} className={cn("text-xl", DIRECTION_TEXT[primaryChange.direction])} />}
          hint={
            <span className="flex flex-col gap-0.5">
              <ChangeLine label="7 gün" change={change7} />
              <ChangeLine label={`${overview.days} gün`} change={change30} />
            </span>
          }
        />
      ) : null}
    </div>
  );
}
