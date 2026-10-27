import { MeasuredValue } from "@/components/common/measured-value";
import { PlanSection } from "@/components/weekly-plan/plan-section";
import { Badge } from "@/components/ui/badge";
import type { SimilarSizePool } from "@/lib/domain/insights";
import { formatCompact, formatNumber } from "@/lib/format";
import { COMPARISON_PLAIN } from "@/lib/plain-language-results";

/** Senin boyundaki rakipler: takipçi sayısı seninkinin üçte biri ile üç katı arasındaki izlenen rakipler. Boşsa bunu açıkça söyler (rakip yok ≠ ölçülemedi). */
export function SimilarSizeCard({ pool }: { pool: SimilarSizePool }) {
  return (
    <PlanSection
      id="similar"
      title={COMPARISON_PLAIN.similar.title}
      description={
        <>
          {COMPARISON_PLAIN.similar.description}{" "}
          <MeasuredValue value={pool.ownFollowers} format={formatCompact} reason={COMPARISON_PLAIN.similar.ownUnknown} />
        </>
      }
    >
      {pool.count === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          {pool.ownFollowers === undefined ? COMPARISON_PLAIN.similar.ownUnknown : COMPARISON_PLAIN.similar.none}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground tabular">{COMPARISON_PLAIN.similar.count(formatNumber(pool.count) ?? "")}</span>
          {pool.handles.map((handle) => (
            <Badge key={handle} variant="secondary">
              @{handle}
            </Badge>
          ))}
        </div>
      )}
    </PlanSection>
  );
}
