import { Heading, Quote, UnverifiedMark } from "@/components/video/analysis-parts";
import { isQuoteUnverified } from "@/components/video/evidence-labels";
import { labelKeyLabel, labelValueLabel, sectionTypeLabel } from "@/components/video/taxonomy-labels";
import { MeasuredValue } from "@/components/common/measured-value";
import { Badge } from "@/components/ui/badge";
import type { ContentAnalysis } from "@/lib/domain/intel";
import { formatDuration } from "@/lib/format";

/** Bölümler: tip + birebir alıntı + başlangıç saniyesi (zamanlı); doğrulanamayan alıntı işaretli. */
export function AnalysisSections({ analysis }: { analysis: ContentAnalysis }) {
  if (analysis.sections.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <Heading>Bölümler</Heading>
      <ol className="flex flex-col gap-2">
        {analysis.sections.map((section, index) => (
          <li key={`${section.type}:${index}`} className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3">
            <Badge variant="outline">{sectionTypeLabel(section.type)}</Badge>
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span>“{section.quote}”</span>
              {isQuoteUnverified(analysis.evidenceReport, "section", section.quote) ? <UnverifiedMark /> : null}
            </span>
            <span className="text-xs text-muted-foreground tabular">
              <MeasuredValue
                value={formatDuration(section.startSec)}
                reason="Bu bölümün başlangıç saniyesi alınamadı."
              />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Etiketler (konu, ton, çerçeve, CTA türü): her biri birebir kanıt alıntılı; doğrulanamayan alıntı işaretli. */
export function AnalysisLabels({ analysis }: { analysis: ContentAnalysis }) {
  if (analysis.labels.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <Heading>Etiketler</Heading>
      <ul className="flex flex-col gap-2">
        {analysis.labels.map((label, index) => (
          <li key={`${label.key}:${index}`} className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">{labelKeyLabel(label.key)}:</span>
              <Badge variant="secondary">{labelValueLabel(label.key, label.value)}</Badge>
              {isQuoteUnverified(analysis.evidenceReport, "label", label.evidence) ? <UnverifiedMark /> : null}
            </span>
            <Quote>{label.evidence}</Quote>
          </li>
        ))}
      </ul>
    </section>
  );
}
