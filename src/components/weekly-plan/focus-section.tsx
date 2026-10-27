import { ContentLink } from "@/components/common/content-link";
import { MeasuredValue } from "@/components/common/measured-value";
import { ConfidenceBadge } from "@/components/weekly-plan/confidence-badge";
import { PlanNote, PlanSection } from "@/components/weekly-plan/plan-section";
import { QuoteBlock } from "@/components/weekly-plan/quote-block";
import { TAP_LINKS } from "@/components/weekly-plan/tap-target";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { FocusDirection, FocusSection } from "@/lib/domain/weekly-plan";
import { formatNumber } from "@/lib/format";
import { FOCUS_GROUP_PLAIN, FOCUS_PLAIN, focusFactsPlain, focusTypicalPlain, plainOrFallback } from "@/lib/plain-language-plan";

const EVIDENCE_LINK_LIMIT = 4;

/**
 * Yön kartı. "Etki / Yenilik / Puan / Örnek" sayıları yerine yapısal alanlardan kurulan düz cümleler (`focusFactsPlain`): sunucunun
 * gerekçe cümlesi (`direction.rationale`) panel jargonu taşıyabildiği için burada çizilmez; alıntı (`rationaleQuote`) çizilir.
 */
function DirectionCard({ direction }: { direction: FocusDirection }) {
  const evidenceIds = direction.evidenceContentIds.slice(0, EVIDENCE_LINK_LIMIT);
  const typical = focusTypicalPlain(direction.impact);
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{FOCUS_GROUP_PLAIN[direction.group]}</Badge>
          <ConfidenceBadge level={direction.confidence} sampleSize={direction.sampleSize} />
        </div>
        <h3 className="text-base font-semibold leading-snug">{direction.label}</h3>
        <p className="text-sm">
          {typical === undefined ? <MeasuredValue value={undefined} inline reason={FOCUS_PLAIN.unmeasuredImpact} /> : typical} {focusFactsPlain(direction)}
        </p>
        {direction.rationaleQuote ? <QuoteBlock quote={direction.rationaleQuote} /> : null}
        {evidenceIds.length > 0 ? (
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            <span>{FOCUS_PLAIN.evidenceLabel}</span>
            {evidenceIds.map((id, index) => (
              <ContentLink key={id} id={id} className={TAP_LINKS}>
                {FOCUS_PLAIN.evidenceLinkText(index + 1)}
                <span className="sr-only">{FOCUS_PLAIN.evidenceLinkHidden(direction.label)}</span>
              </ContentLink>
            ))}
            {direction.evidenceContentIds.length > evidenceIds.length ? (
              <span>+{formatNumber(direction.evidenceContentIds.length - evidenceIds.length)}</span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Bölüm 2 — Bu hafta neye yüklen: 2–3 yön; sıralama etki × yenilikten, güven video sayısından. */
export function FocusSectionView({ focus }: { focus: FocusSection }) {
  return (
    <PlanSection id="focus" title="Bu hafta neye yüklen" description={FOCUS_PLAIN.description}>
      {focus.directions.length === 0 ? (
        <PlanNote>{plainOrFallback(focus.unmeasuredReason, FOCUS_PLAIN.unmeasured)}</PlanNote>
      ) : (
        <ol className="grid gap-4 lg:grid-cols-3">
          {focus.directions.map((direction) => (
            <li key={`${direction.group}:${direction.value}`}>
              <DirectionCard direction={direction} />
            </li>
          ))}
        </ol>
      )}
    </PlanSection>
  );
}
