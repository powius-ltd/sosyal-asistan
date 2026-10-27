import { ChartLine } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { SnapshotChart, type ViewsPoint } from "@/components/video/snapshot-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MetricSnapshot } from "@/lib/domain/content";

/** İzlenme serisi kartı: ölçülmemiş (undefined) noktalar çizilmez, 0 uydurulmaz. */
export function SnapshotChartCard({ snapshots, timeZone }: { snapshots: MetricSnapshot[]; timeZone?: string }) {
  const points: ViewsPoint[] = snapshots.flatMap((s) =>
    s.views === undefined ? [] : [{ capturedAt: s.capturedAt, views: s.views }],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>İzlenme seyri</CardTitle>
        <CardDescription>Ölçüm noktalarına göre izlenmenin zamanla değişimi.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {points.length === 0 ? (
          <EmptyState
            icon={ChartLine}
            title="İzlenme serisi yok"
            description={
              snapshots.length === 0
                ? "Bu içerik için henüz ölçüm noktası alınmadı."
                : "Ölçüm noktalarında izlenme sayısı alınamadı; seri çizilemiyor."
            }
          />
        ) : (
          <>
            <SnapshotChart points={points} timeZone={timeZone} />
            {points.length === 1 ? (
              <p className="text-xs text-muted-foreground">Tek ölçüm var; seri için en az iki ölçüm gerekir.</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
