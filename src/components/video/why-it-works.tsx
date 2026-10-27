import { Clock, TriangleAlert } from "lucide-react";

import { LiftBadge } from "@/components/common/lift-badge";
import { MeasuredValue } from "@/components/common/measured-value";
import { ViewsPerFollowerLabel } from "@/components/outliers/outlier-metrics";
import { formatViewsPerFollower, viewsPerFollower } from "@/components/outliers/views-per-follower";
import { excludedRows } from "@/components/video/excluded-rows";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BaselineExplanation, ContentScore } from "@/lib/domain/content";
import { FORMAT_LABEL, VIEWS_KIND_LABEL } from "@/lib/domain/platform";
import { formatDate, formatNumber } from "@/lib/format";
import { WHY_PLAIN, whyFormula, whyLowSample, whyNormalDefinition } from "@/lib/plain-language-publish";

/** Kıyaslamaya girmeyenler: yalnız sıfırdan büyük sayaçlar; hiçbiri yoksa kısa not. */
function ExcludedList({ excluded }: { excluded: BaselineExplanation["excluded"] }) {
  const rows = excludedRows(excluded);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Bu hesapta dışarıda bırakılan video yok.</p>;
  }
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
      {rows.map(({ key, label, count }) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right tabular">{formatNumber(count)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * "Neden tuttu?": normalinin kaç katı + normalin nasıl hesaplandığı (kaç video, hariç tutulanlar, güven) + izlenme/takipçi.
 * Metinler düz dildedir (`WHY_PLAIN`, `plain-language-publish.ts`); lift / baz çizgisi / medyan ekranda yazılmaz. `views`/`followers` verilmezse
 * oran ölçülemedi (tire + sebep) gösterilir; çapraz skor ekranda yok (yalnız etiket ipucunda anılır).
 */
export function WhyItWorks({
  score,
  baseline,
  timeZone,
  views,
  followers,
}: {
  score: ContentScore;
  baseline: BaselineExplanation;
  timeZone?: string;
  /** İçeriğin son ölçülen izlenmesi. */
  views?: number;
  /** Sahibinin takipçi sayısı. */
  followers?: number;
}) {
  const viewsKind = baseline.viewsKind ? VIEWS_KIND_LABEL[baseline.viewsKind] : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{WHY_PLAIN.title}</CardTitle>
        <CardDescription>{WHY_PLAIN.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <LiftBadge {...score} className="text-base" />
          <span className="text-sm text-muted-foreground">
            {whyFormula(baseline.targetViews, baseline.medianViews, score.lift) ??
              baseline.unmeasuredReason ??
              WHY_PLAIN.unmeasuredFallback}
          </span>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">{WHY_PLAIN.howTitle}</p>
          <p className="text-muted-foreground">
            {whyNormalDefinition(FORMAT_LABEL[baseline.format], viewsKind, baseline.windowSize, baseline.n)}
          </p>
        </div>

        {baseline.lowConfidence ? (
          <p className="flex items-start gap-2 rounded-lg bg-notice-quiet px-3 py-2 text-sm text-warning-soft-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{whyLowSample(baseline.n, 10)}</span>
          </p>
        ) : null}

        {score.immature ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{WHY_PLAIN.immature}</span>
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">{WHY_PLAIN.excludedTitle}</p>
          <ExcludedList excluded={baseline.excluded} />
        </div>

        <div className="flex items-center justify-between gap-4 border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            <ViewsPerFollowerLabel />
          </span>
          <MeasuredValue measured={viewsPerFollower(views, followers)} format={formatViewsPerFollower} />
        </div>

        {baseline.basis.length > 0 ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Kıyaslamaya giren {formatNumber(baseline.basis.length)} video
            </summary>
            <ul className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-muted-foreground">
              {baseline.basis.map((b) => (
                <li key={b.contentItemId} className="contents">
                  <span>{formatDate(b.publishedAt, timeZone) ?? "Tarih yok"}</span>
                  <span className="text-right tabular text-foreground">{formatNumber(b.views)}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
