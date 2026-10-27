import { ComparisonTable } from "@/components/comparison/comparison-table";
import { LiftGroupTable } from "@/components/comparison/lift-group-table";
import { SimilarSizeCard } from "@/components/comparison/similar-size-card";
import { UnmeasuredInsights } from "@/components/comparison/unmeasured-insights";
import { HOOK_TYPES } from "@/lib/domain/hook-types";
import type { InsightSection, Insights } from "@/lib/domain/insights";
import {
  CTA_TYPES,
  CTA_TYPE_LABEL,
  DURATION_BUCKETS,
  DURATION_BUCKET_LABEL,
} from "@/lib/domain/taxonomy";
import { COMPARISON_PLAIN, openingTypeLabel } from "@/lib/plain-language-results";

/** Karşılaştırma ekranı: tablo → hangi süre tutuyor → izleyiciden istediğin şey → hangi açılış tarzı tutuyor → senin boyundaki rakipler → hesaplayamadıklarım. */
export function ComparisonView({ insights }: { insights: Insights }) {
  const reasonFor = (section: InsightSection) => insights.unmeasured.find((item) => item.section === section)?.reason;
  const { groups } = COMPARISON_PLAIN;
  return (
    <div className="flex flex-col gap-10">
      <ComparisonTable rows={insights.rows} scope={insights.scope} />
      <LiftGroupTable
        id="duration"
        title={groups.duration.title}
        description={groups.duration.description}
        groups={insights.durationBuckets}
        labelOf={(key) => DURATION_BUCKET_LABEL[key]}
        order={DURATION_BUCKETS}
        unmeasuredReason={reasonFor("duration_buckets")}
      />
      <LiftGroupTable
        id="cta"
        title={groups.cta.title}
        description={groups.cta.description}
        groups={insights.ctaTypes}
        labelOf={(key) => CTA_TYPE_LABEL[key]}
        order={CTA_TYPES}
        unmeasuredReason={reasonFor("cta_types")}
      />
      <LiftGroupTable
        id="hooks"
        title={groups.opening.title}
        description={groups.opening.description}
        groups={insights.hookTypes}
        labelOf={openingTypeLabel}
        order={HOOK_TYPES}
        unmeasuredReason={reasonFor("hook_types")}
      />
      <SimilarSizeCard pool={insights.similarSize} />
      <UnmeasuredInsights items={insights.unmeasured} />
    </div>
  );
}
