import { MeasuredValue } from "@/components/common/measured-value";
import { ScrollTable } from "@/components/common/scroll-hint";
import { sectionTypeLabel } from "@/components/video/taxonomy-labels";
import { ConfidenceBadge } from "@/components/weekly-plan/confidence-badge";
import { PlanNote, PlanSection } from "@/components/weekly-plan/plan-section";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRecipeValue, formatShare } from "@/lib/anatomy/format";
import { ANATOMY_PLAIN, CTA_POSITION_PLAIN, RECIPE_METRIC_PLAIN } from "@/lib/anatomy/plain";
import { timesText } from "@/lib/plain-language-results";
import {
  CTA_POSITIONS,
  type AnatomyReport,
  type RecipeCohort,
  type RecipeMetric,
  type RecipeValue,
} from "@/lib/domain/anatomy";

const METRICS = Object.keys(RECIPE_METRIC_PLAIN) as RecipeMetric[];
const { recipe: R } = ANATOMY_PLAIN;

/** Kohort hücresi: ölçülmüşse değer (+ n), değilse tire + sebep (0 değil). */
function ValueCell({ value, format }: { value: RecipeValue; format: (n: number) => string }) {
  return (
    <TableCell className="tabular">
      <MeasuredValue value={value.value} reason={value.reason} format={format} />
      {value.value !== undefined ? <span className="text-xs text-muted-foreground">{R.sampleCount(String(value.n))}</span> : null}
    </TableCell>
  );
}

function CtaPositions({ cohort }: { cohort: RecipeCohort }) {
  const parts = CTA_POSITIONS.filter((key) => cohort.ctaPositionCounts[key] !== undefined).map((key) => `${CTA_POSITION_PLAIN[key]}: ${cohort.ctaPositionCounts[key]}`);
  return (
    <TableCell className="text-xs">
      <MeasuredValue value={parts.length === 0 ? undefined : parts.join(" · ")} reason={R.ctaUnmeasured} />
    </TableCell>
  );
}

/**
 * Tutan videoların ortak özellikleri: grup kıyası (tutan videolar · diğer rakip videoları · kendi videoların) + kendi ↔ tutan fark cümleleri.
 * Her sütun güven rozetiyle; grupta ölçülmüş örnek 3'ten azsa değer yerine tire + sebep. Metinler kodla üretilir (LLM yok). Tablo dar
 * ekranda yana kayar: ilk sütun yapışkan, kaydırma ipucu görünür.
 */
export function RecipeCard({ recipe, minLift }: { recipe: AnatomyReport["recipe"]; minLift: number }) {
  const { cohorts, differences } = recipe;
  const bodyTypes = Object.keys(cohorts[0]?.bodyShares ?? {});

  return (
    <PlanSection
      id="recipe"
      title={R.title}
      description={R.description(timesText(minLift))}
    >
      {cohorts.length === 0 ? (
        <PlanNote>{R.empty}</PlanNote>
      ) : (
        <>
          {differences.some((d) => d.text !== undefined) ? (
            <ul className="flex flex-col gap-1.5 rounded-xl border bg-muted/30 px-4 py-3 text-sm">
              {differences.map((d) => (
                <li key={d.metric} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{d.label}:</span>
                  {d.text !== undefined ? (
                    <>
                      <span>{d.text}</span>
                      <ConfidenceBadge level={d.confidence} />
                    </>
                  ) : (
                    <MeasuredValue value={undefined} reason={d.reason} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <PlanNote>{R.noDifference}</PlanNote>
          )}

          <ScrollTable label={R.title} className="min-w-[36rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 min-w-40 bg-background">{R.metric}</TableHead>
                {cohorts.map((cohort) => (
                  <TableHead key={cohort.key}>
                    <div className="flex flex-col gap-1">
                      <span>{cohort.label}</span>
                      <span className="flex items-center gap-1.5 font-normal text-muted-foreground">
                        {R.videos(String(cohort.videoCount))}
                        <ConfidenceBadge level={cohort.confidence} sampleSize={cohort.videoCount} lowBaselineShare={cohort.lowBaselineShare} />
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {METRICS.map((metric) => (
                <TableRow key={metric}>
                  <TableHead scope="row" className="sticky left-0 z-10 bg-background font-medium whitespace-normal">
                    {RECIPE_METRIC_PLAIN[metric]}
                  </TableHead>
                  {cohorts.map((cohort) => (
                    <ValueCell key={cohort.key} value={cohort.metrics[metric]} format={(n) => formatRecipeValue(metric, n)} />
                  ))}
                </TableRow>
              ))}
              {bodyTypes.map((type) => (
                <TableRow key={type}>
                  <TableHead scope="row" className="sticky left-0 z-10 bg-background font-medium whitespace-normal">
                    {R.bodyShare(sectionTypeLabel(type).toLocaleLowerCase("tr-TR"))}
                  </TableHead>
                  {cohorts.map((cohort) => (
                    <ValueCell key={cohort.key} value={cohort.bodyShares[type]} format={formatShare} />
                  ))}
                </TableRow>
              ))}
              <TableRow>
                <TableHead scope="row" className="sticky left-0 z-10 bg-background font-medium whitespace-normal">
                  {R.ctaPositions}
                </TableHead>
                {cohorts.map((cohort) => (
                  <CtaPositions key={cohort.key} cohort={cohort} />
                ))}
              </TableRow>
            </TableBody>
          </ScrollTable>
        </>
      )}
    </PlanSection>
  );
}
