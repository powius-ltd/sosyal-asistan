import { TrendChart } from "@/components/overview/trend-chart";
import { countMeasuredPoints, hasGaps, MIN_CHART_POINTS } from "@/components/overview/trend-math";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrendSeries } from "@/lib/domain/overview";

const CHARTS = [
  { key: "followers", color: "var(--chart-1)", zeroBased: false },
  { key: "views", color: "var(--chart-2)", zeroBased: true },
] as const;

/** Grafik çizmeye yetmeyen (2'den az ölçüm noktası) serinin yerine yazılan cümle. */
export const NOT_ENOUGH_POINTS_TEXT = "Grafik için birkaç günlük ölçüm gerek.";

interface TrendSectionProps {
  trends: TrendSeries[];
  days: number;
  /** "Tüm hesaplar" ya da "@handle · Instagram". */
  scopeLabel: string;
}

/**
 * Takipçi ve izlenme zaman serisi grafikleri. Bir seride 2'den az ölçüm noktası varsa çizgi çizilmez (tek nokta çizgi değildir,
 * eksen etiketleri tekrar eder): yerine cümle yazılır; ikisi de yetersizse tek cümle.
 */
export function TrendSection({ trends, days, scopeLabel }: TrendSectionProps) {
  const entries = CHARTS.map((chart) => {
    const series = trends.find((s) => s.key === chart.key);
    return { ...chart, series, enough: series !== undefined && countMeasuredPoints(series.points) >= MIN_CHART_POINTS };
  });
  if (entries.every((entry) => !entry.enough)) {
    return <p className="text-sm text-muted-foreground">{NOT_ENOUGH_POINTS_TEXT}</p>;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {entries.map(({ key, color, zeroBased, series, enough }) => (
        <Card key={key}>
          <CardHeader>
            <CardTitle>{series?.label ?? (key === "followers" ? "Takipçi" : "İzlenme")}</CardTitle>
            <CardDescription>
              Son {days} gün · {scopeLabel}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {series && enough ? (
              <>
                <TrendChart label={series.label} unit={series.unit} points={series.points} color={color} zeroBased={zeroBased} />
                {hasGaps(series.points) ? (
                  <p className="mt-2 text-xs text-muted-foreground">Çizgideki boşluklar o gün ölçüm alınamadığı anlamına gelir (0 değil).</p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{NOT_ENOUGH_POINTS_TEXT}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
