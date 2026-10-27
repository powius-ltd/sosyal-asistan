"use client";

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import type { AdSeriesPoint } from "@/components/ads/series-points";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import { formatCompact, formatDayMonth, formatMoney } from "@/lib/format";

const COPY = AD_SCREEN_COPY.detail;
const CONFIG = {
  spend: { label: COPY.seriesSpend, color: "var(--chart-1)" },
  costPerResult: { label: COPY.seriesCost, color: "var(--chart-2)" },
} satisfies ChartConfig;

/** Günlük harcama (sütun) ve bir sonucun maliyeti (çizgi; sonuçsuz günde kopuk). Para hesabın kendi para biriminde. */
export function AdSeriesChart({ points, currency }: { points: AdSeriesPoint[]; currency: string }) {
  return (
    <ChartContainer config={CONFIG} className="aspect-auto h-64 w-full" role="img" aria-label={COPY.seriesTitle}>
      <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(value: string) => formatDayMonth(`${value}T12:00:00Z`) ?? value} />
        <YAxis yAxisId="spend" width={48} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatCompact(value) ?? ""} />
        <YAxis yAxisId="cost" orientation="right" width={48} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatCompact(value) ?? ""} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => `${CONFIG[name as keyof typeof CONFIG]?.label ?? name}: ${formatMoney(Number(value), currency) ?? ""}`} />} />
        <Bar yAxisId="spend" dataKey="spend" fill="var(--color-spend)" radius={2} isAnimationActive={false} />
        <Line yAxisId="cost" dataKey="costPerResult" stroke="var(--color-costPerResult)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </ChartContainer>
  );
}
