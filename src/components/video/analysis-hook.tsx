import { Heading, Quote, UnverifiedMark } from "@/components/video/analysis-parts";
import { isQuoteUnverified } from "@/components/video/evidence-labels";
import { MeasuredValue } from "@/components/common/measured-value";
import { HookSourceBadge } from "@/components/hooks/hook-source-badge";
import { Badge } from "@/components/ui/badge";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import type { ContentAnalysis } from "@/lib/domain/intel";
import { ANALYSIS_PLAIN } from "@/lib/plain-language-publish";

/**
 * Açılış (hook): kaynaktan BİREBİR metin + kaynağı (konuşma / ekran yazısı / açıklama) + taksonomi türü + türü doğrulayan alıntı.
 * Kaynak ya da tür yoksa (eski analiz ya da belirlenemedi) tire + sebep gösterilir; doğrulanamayan alıntı işaretlenir.
 */
export function AnalysisHook({ analysis }: { analysis: ContentAnalysis }) {
  const { hookText, hookSource, hookType, hookTypeEvidence, evidenceReport } = analysis;

  return (
    <section className="flex flex-col gap-2">
      <Heading>{ANALYSIS_PLAIN.hookHeading}</Heading>
      {hookText ? (
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span>“{hookText}”</span>
          {isQuoteUnverified(evidenceReport, "hook", hookText) ? <UnverifiedMark /> : null}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{ANALYSIS_PLAIN.hookMissing}</p>
      )}
      <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <dt>Kaynak:</dt>
          <dd>
            <MeasuredValue
              value={hookSource}
              format={(source) => <HookSourceBadge source={source} />}
              reason={ANALYSIS_PLAIN.hookSourceMissing}
            />
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt>Tür:</dt>
          <dd>
            <MeasuredValue
              value={hookType ? hookTypeLabel(hookType) : undefined}
              format={(label) => <Badge variant="secondary">{label}</Badge>}
              reason={ANALYSIS_PLAIN.hookTypeMissing}
            />
          </dd>
        </div>
      </dl>
      {hookTypeEvidence ? (
        <div className="flex flex-col items-start gap-1">
          <Quote>{hookTypeEvidence}</Quote>
          {isQuoteUnverified(evidenceReport, "hook_type", hookTypeEvidence) ? <UnverifiedMark /> : null}
        </div>
      ) : null}
    </section>
  );
}
