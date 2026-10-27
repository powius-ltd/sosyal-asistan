import { LiftBadge } from "@/components/common/lift-badge";
import { ScrollTable } from "@/components/common/scroll-hint";
import { MeasuredValue } from "@/components/common/measured-value";
import { ConfidenceBadge } from "@/components/weekly-plan/confidence-badge";
import { PlanNote, PlanSection } from "@/components/weekly-plan/plan-section";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { GroupedLift, LiftGroupStat } from "@/lib/domain/insights";
import { formatNumber } from "@/lib/format";
import { COMPARISON_PLAIN, plainOrFallback, VS_NORMAL } from "@/lib/plain-language-results";

const NO_VIDEO = COMPARISON_PLAIN.noVideoThisSide;

/** Bir tarafın (kendi / rakipler) dört hücresi: video sayısı, medyan lift, tutan sayısı, güven. */
function StatCells({ stat, first }: { stat?: LiftGroupStat; first?: boolean }) {
  const edge = first ? "border-l" : "";
  if (!stat) {
    return (
      <>
        {[0, 1, 2, 3].map((i) => (
          <TableCell key={i} className={i === 0 ? edge : undefined}>
            <MeasuredValue value={undefined} reason={NO_VIDEO} />
          </TableCell>
        ))}
      </>
    );
  }
  return (
    <>
      <TableCell className={`tabular ${edge}`}>
        {formatNumber(stat.n)}
        {stat.liftN < stat.n ? <span className="text-xs text-muted-foreground">{COMPARISON_PLAIN.measured(formatNumber(stat.liftN) ?? "")}</span> : null}
      </TableCell>
      <TableCell>
        <LiftBadge lift={stat.medianLift} />
      </TableCell>
      <TableCell>
        {/* Normali hesaplanan video yoksa "0 tutan" değil, ölçülemedi. */}
        <MeasuredValue value={stat.liftN === 0 ? undefined : stat.outlierCount} reason={COMPARISON_PLAIN.outliersUnmeasured} />
      </TableCell>
      <TableCell>
        <ConfidenceBadge level={stat.confidence} sampleSize={stat.liftN} lowBaselineShare={stat.lowBaselineShare} />
      </TableCell>
    </>
  );
}

interface LiftGroupTableProps<K extends string> {
  id: string;
  title: string;
  description: string;
  groups: GroupedLift<K>;
  labelOf: (key: K) => string;
  /** Satır sırası (taksonomi sırası); listede olmayan anahtar sona, alfabetik eklenir. */
  order: readonly K[];
  /** Grup boşken gösterilen sebep (`Insights.unmeasured`). */
  unmeasuredReason?: string;
}

function orderedKeys<K extends string>(groups: GroupedLift<K>, order: readonly K[]): K[] {
  const present = new Set<K>([...groups.own, ...groups.competitors].map((stat) => stat.key));
  const known = order.filter((key) => present.has(key));
  const extra = [...present].filter((key) => !order.includes(key)).sort();
  return [...known, ...extra];
}

/** Grup × normaline göre tablosu (süre, izleyiciden istenen şey, açılış tarzı …): kendi hesap ve rakipler AYRI sütun grubunda; video sayısı, normaline göre, tutan, güven. Dar ekranda ilk sütun yapışkan, yana kaydırma ipucu görünür. */
export function LiftGroupTable<K extends string>({
  id,
  title,
  description,
  groups,
  labelOf,
  order,
  unmeasuredReason,
}: LiftGroupTableProps<K>) {
  const keys = orderedKeys(groups, order);
  const ownByKey = new Map(groups.own.map((stat) => [stat.key, stat]));
  const rivalByKey = new Map(groups.competitors.map((stat) => [stat.key, stat]));

  return (
    <PlanSection id={id} title={title} description={description}>
      {keys.length === 0 ? (
        <PlanNote>{plainOrFallback(unmeasuredReason, COMPARISON_PLAIN.groupEmpty)}</PlanNote>
      ) : (
        <ScrollTable label={title} className="min-w-[44rem]">
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2} className="sticky left-0 z-10 min-w-32 bg-background align-bottom">
                {COMPARISON_PLAIN.group.name}
              </TableHead>
              <TableHead colSpan={4} className="border-l text-center">
                {COMPARISON_PLAIN.group.own}
              </TableHead>
              <TableHead colSpan={4} className="border-l text-center">
                {COMPARISON_PLAIN.group.rivals}
              </TableHead>
            </TableRow>
            <TableRow>
              {["own", "rivals"].flatMap((side) =>
                [COMPARISON_PLAIN.group.videos, VS_NORMAL.column, COMPARISON_PLAIN.group.outliers, COMPARISON_PLAIN.group.confidence].map((column, index) => (
                  <TableHead key={`${side}:${column}`} className={index === 0 ? "border-l" : undefined}>
                    {column}
                  </TableHead>
                )),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key}>
                <TableHead scope="row" className="sticky left-0 z-10 bg-background font-medium whitespace-normal">
                  {labelOf(key)}
                </TableHead>
                <StatCells stat={ownByKey.get(key)} first />
                <StatCells stat={rivalByKey.get(key)} first />
              </TableRow>
            ))}
          </TableBody>
        </ScrollTable>
      )}
      {keys.length > 0 && unmeasuredReason ? <p className="text-xs text-muted-foreground">{plainOrFallback(unmeasuredReason, COMPARISON_PLAIN.groupEmpty)}</p> : null}
    </PlanSection>
  );
}
