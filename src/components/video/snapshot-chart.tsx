"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { trendSummary } from "@/components/overview/trend-math";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCompact, formatDate, formatDateTime, formatNumber } from "@/lib/format";

export interface ViewsPoint {
  /** ISO zaman damgası. */
  capturedAt: string;
  views: number;
}

const CONFIG = {
  views: { label: "İzlenme", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** İzlenmenin zaman içindeki seyri (metric_snapshots). Yalnız ölçülmüş noktalar çizilir. */
export function SnapshotChart({ points, timeZone }: { points: ViewsPoint[]; timeZone?: string }) {
  const data = points.map((p) => ({ t: new Date(p.capturedAt).getTime(), views: p.views }));
  // Eğilim özeti erişilebilir adın parçasıdır (Özet grafikleriyle aynı yardımcı, D3-15): noktalar tek tek odaklanmaz.
  const summary = trendSummary(
    points.map((p) => ({ date: p.capturedAt, value: p.views })),
    (value) => formatNumber(value),
    (key) => formatDate(key, timeZone),
  );

  return (
    <ChartContainer
      config={CONFIG}
      className="aspect-auto h-64 w-full"
      role="img"
      aria-label={summary === undefined ? "İzlenme zaman serisi grafiği" : `İzlenme zaman serisi grafiği. ${summary}`}
    >
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value: number) => formatDate(new Date(value), timeZone) ?? ""}
        />
        <YAxis
          width={48}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatCompact(value) ?? ""}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => formatDateTime(new Date(Number(payload?.[0]?.payload?.t)), timeZone)}
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">İzlenme</span>
                  <span className="font-mono font-medium tabular-nums">{formatNumber(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="views"
          name="İzlenme"
          stroke="var(--color-views)"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
