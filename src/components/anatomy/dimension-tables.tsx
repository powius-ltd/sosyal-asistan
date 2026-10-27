import { bodyMixGroups, bodyMixLabel } from "@/components/anatomy/body-mix-groups";
import { LiftGroupTable } from "@/components/comparison/lift-group-table";
import {
  CTA_POSITIONS,
  FIRST_SECTION_BUCKETS,
  FIRST_SECTION_LABEL,
  HOOK_LENGTH_BUCKETS,
  HOOK_LENGTH_LABEL,
  TEMPO_BUCKET_LABEL,
  TEMPO_BUCKETS,
  type AnatomyReport,
} from "@/lib/domain/anatomy";
import { ANATOMY_PLAIN, CTA_POSITION_PLAIN } from "@/lib/anatomy/plain";
import { HOOK_TYPES } from "@/lib/domain/hook-types";
import type { Insights, InsightSection } from "@/lib/domain/insights";
import { openingTypeLabel } from "@/lib/plain-language-results";
import { CTA_TYPE_LABEL, CTA_TYPES, DURATION_BUCKET_LABEL, DURATION_BUCKETS, type CtaType, type DurationBucket } from "@/lib/domain/taxonomy";

const reasonOf = (insights: Insights, section: InsightSection) => insights.unmeasured.find((u) => u.section === section)?.reason;
const { dimensions: D } = ANATOMY_PLAIN;

/**
 * Özellik tabloları. Açılış cümlesi uzunluğu, konuya geçiş, videonun ortası, çağrının yeri ve kurgu hızı `AnatomyReport`'tan; açılış tarzı,
 * izleyiciden istenen şey ve süre Karşılaştırma verisinden (`getInsights`) okunur, yeniden hesaplanmaz. Hepsi `LiftGroupTable` (kendi ↔ rakip,
 * video sayısı, normaline göre, tutan, güven); boş taraf/tablo sebebiyle gelir.
 */
export function DimensionTables({ report, insights }: { report: AnatomyReport; insights: Insights }) {
  const body = bodyMixGroups(report.bodyMix);
  const bodyReason = report.unmeasured.find((u) => u.section === "body_mix")?.reason;
  return (
    <div className="flex flex-col gap-8">
      <LiftGroupTable
        id="hook-length"
        title={D.openingLength.title}
        description={D.openingLength.description}
        groups={report.hookLength.grouped}
        labelOf={(key) => HOOK_LENGTH_LABEL[key]}
        order={HOOK_LENGTH_BUCKETS}
        unmeasuredReason={report.hookLength.unmeasuredReason}
      />
      <LiftGroupTable
        id="first-section"
        title={D.firstSection.title}
        description={D.firstSection.description}
        groups={report.firstSection.grouped}
        labelOf={(key) => FIRST_SECTION_LABEL[key]}
        order={FIRST_SECTION_BUCKETS}
        unmeasuredReason={report.firstSection.unmeasuredReason}
      />
      <LiftGroupTable
        id="body-mix"
        title={D.body.title}
        description={D.body.description}
        groups={body.groups}
        labelOf={bodyMixLabel}
        order={body.order}
        unmeasuredReason={bodyReason}
      />
      <LiftGroupTable
        id="cta-position"
        title={D.ctaPosition.title}
        description={D.ctaPosition.description}
        groups={report.ctaPosition.grouped}
        labelOf={(key) => CTA_POSITION_PLAIN[key]}
        order={CTA_POSITIONS}
        unmeasuredReason={report.ctaPosition.unmeasuredReason}
      />
      <LiftGroupTable
        id="tempo"
        title={D.tempo.title}
        description={D.tempo.description}
        groups={report.tempo.grouped}
        labelOf={(key) => TEMPO_BUCKET_LABEL[key]}
        order={TEMPO_BUCKETS}
        unmeasuredReason={report.tempo.unmeasuredReason}
      />
      <LiftGroupTable
        id="hook-type"
        title={D.openingType.title}
        description={D.openingType.description}
        groups={insights.hookTypes}
        labelOf={openingTypeLabel}
        order={HOOK_TYPES}
        unmeasuredReason={reasonOf(insights, "hook_types")}
      />
      <LiftGroupTable<CtaType>
        id="cta-type"
        title={D.ctaType.title}
        description={D.ctaType.description}
        groups={insights.ctaTypes}
        labelOf={(key) => CTA_TYPE_LABEL[key]}
        order={CTA_TYPES}
        unmeasuredReason={reasonOf(insights, "cta_types")}
      />
      <LiftGroupTable<DurationBucket>
        id="duration"
        title={D.duration.title}
        description={D.duration.description}
        groups={insights.durationBuckets}
        labelOf={(key) => DURATION_BUCKET_LABEL[key]}
        order={DURATION_BUCKETS}
        unmeasuredReason={reasonOf(insights, "duration_buckets")}
      />
    </div>
  );
}
