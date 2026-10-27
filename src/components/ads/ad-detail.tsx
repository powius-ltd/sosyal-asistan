import { AdSeriesChart } from "@/components/ads/ad-series-chart";
import { seriesPointsOf } from "@/components/ads/series-points";
import { VerdictReasons } from "@/components/ads/verdict-reasons";
import { ContentLink } from "@/components/common/content-link";
import { MeasuredValue } from "@/components/common/measured-value";
import { StatCard } from "@/components/common/stat-card";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import type { AdDetail } from "@/lib/domain/ads";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

const COPY = AD_SCREEN_COPY.detail;

/** Reklam ayrıntısı: şerit, öneri + nedenler, günlük seri, ölçüler, video ölçüleri, kampanya / set, bağlı içerik. */
export function AdDetailView({ detail }: { detail: AdDetail }) {
  const { result, account, series } = detail;
  const { currency } = account;
  const { sums, metrics } = result;
  const points = seriesPointsOf(series);
  const isVideo = result.creative?.format === "video";
  const money = (value: number) => formatMoney(value, currency);
  return (
    <div className="space-y-6">
      <section aria-label="Özet" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={AD_SCREEN_COPY.strip.spend} value={<MeasuredValue value={sums.spend} format={money} />} />
        <StatCard label={AD_SCREEN_COPY.strip.results(account.goal?.resultLabel)} value={<MeasuredValue value={sums.results} reason={AD_SCREEN_COPY.strip.resultsReason} inline format={(value) => formatNumber(value)} />} />
        <StatCard label={AD_SCREEN_COPY.strip.costPerResult} value={<MeasuredValue value={metrics.costPerResult} reason={AD_SCREEN_COPY.strip.costReason} inline format={money} />} />
        <StatCard label={AD_SCREEN_COPY.strip.returnOnSpend} value={<MeasuredValue value={metrics.returnOnSpend} reason={AD_SCREEN_COPY.strip.returnReason} inline format={money} />} />
      </section>
      <VerdictReasons verdict={result.verdict} />
      <section data-slot="ad-series" aria-label={COPY.seriesTitle}>
        <h2 className="mb-2 text-lg font-semibold">{COPY.seriesTitle}</h2>
        {points.length === 0 ? <p className="text-sm text-muted-foreground">{COPY.seriesEmpty}</p> : <AdSeriesChart points={points} currency={currency} />}
      </section>
      <section aria-label={COPY.measuresTitle}>
        <h2 className="mb-2 text-lg font-semibold">{COPY.measuresTitle}</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label={COPY.measures.clickRate}><MeasuredValue value={metrics.clickRate} reason="Tıklama ölçülmüyor." inline format={(value) => formatPercent(value, 2)} /></Row>
          <Row label={COPY.measures.costPerClick}><MeasuredValue value={metrics.costPerClick} reason="Tıklama ölçülmüyor." inline format={money} /></Row>
          <Row label={COPY.measures.costPerThousand}><MeasuredValue value={metrics.costPerThousand} reason="Gösterim yok." inline format={money} /></Row>
          <Row label={COPY.measures.resultRate}><MeasuredValue value={metrics.resultRate} reason="Sonuç ya da tıklama ölçülmüyor." inline format={(value) => formatPercent(value, 2)} /></Row>
        </dl>
      </section>
      <section data-slot="ad-video" aria-label={COPY.video.title}>
        <h2 className="mb-2 text-lg font-semibold">{COPY.video.title}</h2>
        {isVideo ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row label={COPY.video.firstThree}><MeasuredValue value={metrics.threeSecondRate} reason="Video izlenmesi ölçülmüyor." inline format={(value) => formatPercent(value, 1)} /></Row>
            <Row label={COPY.video.hold}><MeasuredValue value={metrics.holdRate} reason="Video izlenmesi ölçülmüyor." inline format={(value) => formatPercent(value, 1)} /></Row>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">{COPY.video.none}</p>
        )}
      </section>
      <section aria-label={COPY.structure.title}>
        <h2 className="mb-2 text-lg font-semibold">{COPY.structure.title}</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label={COPY.structure.campaign}>{detail.campaignName ?? "—"}</Row>
          <Row label={COPY.structure.adSet}>{detail.adSetName ?? "—"}</Row>
          <Row label="Durum">{COPY.status[result.ad.status]}</Row>
        </dl>
      </section>
      <section data-slot="ad-content" aria-label={COPY.content.title}>
        <h2 className="mb-2 text-lg font-semibold">{COPY.content.title}</h2>
        {result.creative?.sourceContentId ? (
          <p className="text-sm">
            {COPY.content.linked} <ContentLink id={result.creative.sourceContentId}>Videoyu aç</ContentLink>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{COPY.content.none}</p>
        )}
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right">{children}</dd>
    </div>
  );
}
