"use client";

import { CartesianGrid, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

import { LiftBadge } from "@/components/common/lift-badge";
import {
  pointFillClass,
  type PublishedViewsPoint,
} from "@/components/content/published-views";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { formatCompact, formatDate, formatNumber } from "@/lib/format";
import { CONTENT_PLAIN, chartSummary } from "@/lib/plain-language-publish";
import { cn } from "@/lib/utils";

const CONFIG = { views: { label: "İzlenme", color: "var(--chart-1)" } } satisfies ChartConfig;

/** "30 Eyl 2026" → "30 Eyl" (yıl eksen etiketinde gereksiz; balonda tam tarih var). */
const tickDate = (ms: number, timeZone?: string) => formatDate(new Date(ms), timeZone)?.replace(/\s\d{4}$/, "") ?? "";

interface PointShapeProps {
  cx?: number;
  cy?: number;
  payload?: PublishedViewsPoint;
}

/** Kademe rengindeki nokta; lift ölçülemeyen video içi boş halka (kademe 0 ile karışmaz). */
function TierDot({ cx, cy, payload }: PointShapeProps) {
  if (cx === undefined || cy === undefined || !payload) return null;
  return <circle cx={cx} cy={cy} r={6} strokeWidth={1.5} className={cn("stroke-background", pointFillClass(payload.tier))} />;
}

function PointTooltip({
  active,
  payload,
  timeZone,
}: {
  active?: boolean;
  payload?: readonly { payload?: PublishedViewsPoint }[];
  timeZone?: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="grid max-w-64 gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <span className="font-medium whitespace-normal">{point.title}</span>
      <span className="text-muted-foreground">
        @{point.handle} · {formatDate(new Date(point.t), timeZone)}
      </span>
      <span className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">İzlenme</span>
        <span className="font-mono font-medium tabular-nums">{formatNumber(point.views)}</span>
      </span>
      <span className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">{CONTENT_PLAIN.tooltipMultiplier}</span>
        <LiftBadge lift={point.lift} liftTier={point.tier} />
      </span>
    </div>
  );
}

/**
 * Kendi içeriklerin izlenmesi, yayın tarihine göre: her nokta bir video, renk lift kademesi. Zaman serisi yerine bu
 * kullanılır (geçmiş ölçüm henüz yok; tek ölçüm noktalı seri boş görünürdü). Y ekseni 0'dan başlar.
 */
export function PublishedViewsChart({ points, timeZone }: { points: PublishedViewsPoint[]; timeZone?: string }) {
  // Grafik görsel bir özettir: noktalar tek tek odaklanmaz, bu yüzden metin karşılığı (en çok / en az izlenen) hem görünür hem erişilebilir ad.
  const summary = chartSummary(points.map((point) => ({ title: point.title, views: point.views, date: formatDate(new Date(point.t), timeZone) ?? "" })));
  return (
    <>
      <ChartContainer
        config={CONFIG}
        className="aspect-auto h-64 w-full"
        role="img"
        aria-label={`Yayın tarihine göre izlenme grafiği. ${summary ?? ""}`}
      >
        <ScatterChart margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            type="number"
            dataKey="t"
            name="Yayın tarihi"
            scale="time"
            domain={["dataMin", "dataMax"]}
            padding={{ left: 16, right: 16 }}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            tickFormatter={(value: number) => tickDate(value, timeZone)}
          />
          <YAxis
            type="number"
            dataKey="views"
            name="İzlenme"
            width={52}
            domain={[0, "auto"]}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatCompact(value) ?? ""}
          />
          <Tooltip cursor={false} content={<PointTooltip timeZone={timeZone} />} />
          <Scatter data={points} shape={TierDot} isAnimationActive={false} />
        </ScatterChart>
      </ChartContainer>
      {summary ? <p className="text-xs text-muted-foreground">{summary}</p> : null}
    </>
  );
}
