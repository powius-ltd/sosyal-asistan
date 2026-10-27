"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { trendSummary } from "@/components/overview/trend-math";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { KpiUnit, TrendPoint } from "@/lib/domain/overview";
import { formatCompact, formatDate, formatNumber, formatPercent } from "@/lib/format";

interface TrendChartProps {
  label: string;
  unit: KpiUnit;
  points: TrendPoint[];
  /** CSS rengi (ör. "var(--chart-1)"). */
  color: string;
  /** true: Y ekseni 0'dan başlar (izlenme); false: verinin aralığına oturur (takipçi). */
  zeroBased?: boolean;
}

/** "YYYY-MM-DD" gün anahtarı → "30 Eyl" (yıl atılır; gün anahtarı zaten workspace saat dilimindedir). */
const tickDate = (dayKey: string) => formatDate(dayKey, "UTC")?.replace(/\s\d{4}$/, "") ?? dayKey;

function valueFormatter(unit: KpiUnit) {
  return (value: number) => (unit === "percent" ? formatPercent(value) : formatNumber(value)) ?? "—";
}

/**
 * Zaman serisi çizgi grafiği. Ölçülemeyen gün (`value` yok) çizgide BOŞLUK olarak kalır —
 * 0 çizilmez, komşu noktalarla da birleştirilmez.
 */
export function TrendChart({ label, unit, points, color, zeroBased = false }: TrendChartProps) {
  const data = points.map((point) => ({ date: point.date, value: point.value ?? null }));
  const config = { value: { label, color } } satisfies ChartConfig;
  const format = valueFormatter(unit);
  // Eğilim özeti erişilebilir adın parçasıdır: noktalar tek tek odaklanmaz (D3-15).
  const summary = trendSummary(points, format, (dayKey) => formatDate(dayKey, "UTC"));

  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-40 w-full sm:h-56"
      role="img"
      aria-label={summary === undefined ? `${label} zaman serisi grafiği` : `${label} zaman serisi grafiği. ${summary}`}
    >
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={tickDate}
        />
        <YAxis
          width={52}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          domain={zeroBased ? [0, "auto"] : ["auto", "auto"]}
          tickFormatter={(value: number) => (unit === "percent" ? formatPercent(value, 0) : formatCompact(value)) ?? ""}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const key = payload?.[0]?.payload?.date;
                return typeof key === "string" ? formatDate(key, "UTC") : null;
              }}
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono font-medium tabular-nums">{format(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          dot={points.length <= 31 ? { r: 2, fill: "var(--color-value)" } : false}
          activeDot={{ r: 4 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
