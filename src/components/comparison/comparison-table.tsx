import { Hint } from "@/components/common/hint";
import { ScrollTable } from "@/components/common/scroll-hint";
import { metricRows } from "@/components/comparison/comparison-metrics";
import { PlatformTabs } from "@/components/comparison/platform-tabs";
import { PlanNote, PlanSection } from "@/components/weekly-plan/plan-section";
import { Badge } from "@/components/ui/badge";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import type { ComparisonRow, InsightsScope } from "@/lib/domain/insights";
import { formatNumber, timeZoneLabel } from "@/lib/format";
import { COMPARISON_PLAIN } from "@/lib/plain-language-results";

/** Hesap sütunu genişliği: 1440 px'te 6–8 hesap sığsın; dar ekranda tablo kendi içinde kayar (sayfa taşmaz). */
const ACCOUNT_COL = "min-w-28 whitespace-normal align-top";

/** Ölçü adı sütunu: yatay kaydırmada görünür kalır (yapışkan). */
const STICKY_COL = "sticky left-0 z-10 w-40 min-w-40 bg-background";

function PlatformTable({ rows, audienceTimeZone, label }: { rows: ComparisonRow[]; audienceTimeZone: string; label: string }) {
  const metrics = metricRows(audienceTimeZone);
  return (
    <ScrollTable label={label} className="text-xs">
      <TableHeader>
        <TableRow>
          <TableHead className={STICKY_COL}>{COMPARISON_PLAIN.table.metric}</TableHead>
          {rows.map((row) => (
            <TableHead key={`${row.subjectKind}:${row.subjectId}`} className={ACCOUNT_COL}>
              <span className="flex flex-col items-start gap-1">
                <span className="font-semibold text-foreground">@{row.handle}</span>
                <Badge variant={row.subjectKind === "own" ? "default" : "secondary"}>
                  {row.subjectKind === "own" ? COMPARISON_PLAIN.table.you : COMPARISON_PLAIN.table.rival}
                </Badge>
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.map((metric) => (
          <TableRow key={metric.id}>
            <TableHead scope="row" className={`${STICKY_COL} whitespace-normal align-top font-medium`}>
              {metric.hint ? (
                <Hint content={metric.hint} label={metric.label}>
                  <span className="underline decoration-dotted underline-offset-2">{metric.label}</span>
                </Hint>
              ) : (
                metric.label
              )}
            </TableHead>
            {rows.map((row) => (
              <TableCell key={`${row.subjectKind}:${row.subjectId}`} className={ACCOUNT_COL}>
                {metric.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </ScrollTable>
  );
}

/**
 * Karşılaştırma tablosu: satırlar ölçüler, sütunlar hesaplar (önce kendi hesap, sonra rakipler). Her platform kendi tablosundadır
 * (birden çok platform varsa sekmeyle ayrılır; aynı kullanıcı adı iki platformda iki sütun olup tabloyu şişirmez). İlk sütun yapışkan:
 * yatay kaydırmada ölçü adı görünür kalır. Ölçülemeyen hücre `MeasuredValue` ile tire + sebep (0 yazılmaz).
 */
export function ComparisonTable({ rows, scope }: { rows: ComparisonRow[]; scope: InsightsScope }) {
  const platforms = [...new Set(rows.map((row) => row.platform))];
  const tabs = platforms.map((platform) => ({
    value: platform,
    label: PLATFORM_LABEL[platform],
    content: (
      <PlatformTable
        rows={rows.filter((row) => row.platform === platform)}
        audienceTimeZone={scope.audienceTimeZone}
        label={COMPARISON_PLAIN.rowsPlatform(PLATFORM_LABEL[platform])}
      />
    ),
  }));
  return (
    <PlanSection
      id="table"
      title={COMPARISON_PLAIN.table.title}
      description={COMPARISON_PLAIN.tableDescription(formatNumber(scope.days) ?? "", timeZoneLabel(scope.audienceTimeZone))}
    >
      {rows.length === 0 ? <PlanNote>{COMPARISON_PLAIN.empty.title}.</PlanNote> : <PlatformTabs tabs={tabs} label={COMPARISON_PLAIN.table.platforms} />}
    </PlanSection>
  );
}
