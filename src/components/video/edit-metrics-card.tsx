import type { ReactNode } from "react";

import { MeasuredValue } from "@/components/common/measured-value";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EDIT_TEMPO_LABEL, type ContentAnalysis, type EditMetrics } from "@/lib/domain/intel";
import { formatDecimal, formatNumber } from "@/lib/format";

/** Ölçülemeyen kurgu alanının sebebi (alan yazılmamıştır: model ölçemedi ya da analiz eski sürümden). */
const MISSING_REASON = "Bu analizde ölçülemedi ya da kaydedilmedi (eski bir analiz sürümü olabilir).";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/**
 * Kurgu ölçümleri (video görüntüsünden): kesme sayısı, tempo, ortalama plan süresi, ekran yazısı, konuşan yüz, müzik,
 * yakılmış altyazı. Ölçülemeyen alan tire + sebep gösterir (0 değil); `false` gerçek ölçümdür ("Hayır"), tire değil.
 * Amaç kurgu ↔ lift ilişkisini görmek; tek videoda yorumlamak için az veridir.
 */
export function EditMetricsCard({ analysis }: { analysis: Pick<ContentAnalysis, "editMetrics"> }) {
  const metrics: EditMetrics = analysis.editMetrics ?? {};
  const reason = MISSING_REASON;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kurgu ölçümleri</CardTitle>
        <CardDescription>Videonun görüntüsünden ölçülen kurgu özellikleri.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          <Row label="Kesme sayısı">
            <MeasuredValue value={metrics.cutCount} format={(v) => formatNumber(v)} reason={reason} />
          </Row>
          <Row label="Tempo">
            <MeasuredValue
              value={metrics.tempo ? EDIT_TEMPO_LABEL[metrics.tempo] : undefined}
              reason={reason}
            />
            {metrics.cutsPerMinute !== undefined ? (
              <span className="ml-1.5 text-xs text-muted-foreground tabular">
                · {formatDecimal(metrics.cutsPerMinute, 1)} kesme/dk
              </span>
            ) : null}
          </Row>
          <Row label="Ortalama plan süresi">
            <MeasuredValue value={metrics.avgShotSec} format={(v) => `${formatDecimal(v, 1)} sn`} reason={reason} />
          </Row>
          <Row label="Ekran yazısı">
            <MeasuredValue value={metrics.onScreenTextCount} format={(v) => `${formatNumber(v)} adet`} reason={reason} />
          </Row>
          <Row label="Konuşan yüz">
            <MeasuredValue value={metrics.onCameraSpeaker} reason={reason} />
          </Row>
          <Row label="Müzik">
            <MeasuredValue value={metrics.hasMusic} reason={reason} />
          </Row>
          <Row label="Yakılmış altyazı">
            <MeasuredValue value={metrics.hasBurnedCaptions} reason={reason} />
          </Row>
        </dl>
      </CardContent>
    </Card>
  );
}
