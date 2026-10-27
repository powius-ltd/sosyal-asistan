import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { PhaseTimeline } from "@/components/anatomy/phase-timeline";
import { ContentLink } from "@/components/common/content-link";
import { LiftBadge } from "@/components/common/lift-badge";
import { MeasuredValue } from "@/components/common/measured-value";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EditMetricsCard } from "@/components/video/edit-metrics-card";
import { sectionTypeLabel } from "@/components/video/taxonomy-labels";
import { ANATOMY_PLAIN, CTA_POSITION_PLAIN } from "@/lib/anatomy/plain";
import {
  FIRST_SECTION_LABEL,
  HOOK_LENGTH_LABEL,
  TEMPO_BUCKET_LABEL,
  type VideoAnatomy,
} from "@/lib/domain/anatomy";
import { firstSectionBucket, hookLengthBucket, tempoBucket } from "@/lib/anatomy/buckets";
import { formatDecimal, formatDuration } from "@/lib/format";

const S = ANATOMY_PLAIN.selected;

/** Sayfanın seçili video durumu: anatomi hazır, video yok ya da analizi yok/başarısız. */
export type AnatomySelection =
  | { kind: "ok"; contentId: string; anatomy: VideoAnatomy; evidenceVerified: boolean }
  | { kind: "not_found"; contentId: string }
  | { kind: "no_analysis"; contentId: string };

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/** Videonun özellikleri: açılış cümlesi uzunluğu, konuya geçiş, çağrının yeri, kurgu hızı, gövde türleri (her biri grup etiketiyle). */
function Dimensions({ anatomy }: { anatomy: VideoAnatomy }) {
  const hook = hookLengthBucket(anatomy.hookWords);
  const first = firstSectionBucket(anatomy.firstSectionAtSec);
  const tempo = tempoBucket(anatomy.editMetrics?.cutsPerMinute);
  const { unmeasured } = anatomy;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{S.dimensionsTitle}</CardTitle>
        <CardDescription>{S.dimensionsHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          <Fact label={S.facts.opening}>
            <MeasuredValue
              value={anatomy.hookWords === undefined ? undefined : `${anatomy.hookWords} ${S.words}${hook ? ` · ${HOOK_LENGTH_LABEL[hook]}` : ""}`}
              reason={unmeasured.hookWords}
            />
          </Fact>
          <Fact label={S.facts.firstSection}>
            <MeasuredValue
              value={anatomy.firstSectionAtSec === undefined ? undefined : `${formatDecimal(anatomy.firstSectionAtSec, 0)} sn${first ? ` · ${FIRST_SECTION_LABEL[first]}` : ""}`}
              reason={unmeasured.firstSectionAtSec}
            />
          </Fact>
          <Fact label={S.facts.cta}>
            <MeasuredValue value={anatomy.ctaPosition === undefined ? undefined : CTA_POSITION_PLAIN[anatomy.ctaPosition]} reason={unmeasured.ctaPosition} />
          </Fact>
          <Fact label={S.facts.tempo}>
            <MeasuredValue
              value={anatomy.editMetrics?.cutsPerMinute === undefined ? undefined : `${formatDecimal(anatomy.editMetrics.cutsPerMinute, 1)} ${S.cuts}${tempo ? ` · ${TEMPO_BUCKET_LABEL[tempo]}` : ""}`}
              reason={unmeasured.cutsPerMinute}
            />
          </Fact>
          <Fact label={S.facts.body}>
            <MeasuredValue
              value={anatomy.phases.length === 0 ? undefined : anatomy.bodyTypes.map(sectionTypeLabel).join(", ") || S.noBody}
              reason={unmeasured.phases}
            />
          </Fact>
        </dl>
      </CardContent>
    </Card>
  );
}

/** Seçili video: başlık (hesap, lift, süre, analiz bağlantısı) + faz zaman çizelgesi + boyutlar + kurgu özeti. */
export function SelectedVideo({ selection }: { selection: AnatomySelection | undefined }) {
  if (selection === undefined) return null;
  if (selection.kind !== "ok") {
    return (
      <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        {selection.kind === "not_found" ? S.notFound : S.noAnalysis}
      </p>
    );
  }
  const { anatomy, evidenceVerified, contentId } = selection;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <span>@{anatomy.ownerHandle}</span>
              <Badge variant={anatomy.isOwn ? "default" : "secondary"}>{anatomy.isOwn ? S.ownAccount : ANATOMY_PLAIN.rival}</Badge>
              <LiftBadge lift={anatomy.lift} liftTier={anatomy.liftTier} />
            </CardTitle>
            <ContentLink id={contentId} className="max-md:min-h-tap max-md:items-center">{S.open}</ContentLink>
          </div>
          <CardDescription>
            {S.duration} <MeasuredValue value={formatDuration(anatomy.durationSec)} reason="Video süresi alınamadı." />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {evidenceVerified ? null : (
            <p className="flex items-start gap-2 rounded-lg border border-notice-border bg-notice px-3 py-2 text-sm text-notice-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {S.unverified}
            </p>
          )}
          <PhaseTimeline anatomy={anatomy} />
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Dimensions anatomy={anatomy} />
        {anatomy.editMetrics ? (
          <EditMetricsCard analysis={{ editMetrics: anatomy.editMetrics }} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{S.editTitle}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <MeasuredValue value={undefined} reason={anatomy.unmeasured.cutsPerMinute} /> {S.noEdit}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
