import { EvidenceList } from "@/components/ideas/evidence-list";
import { RivalQuotes } from "@/components/ideas/rival-quotes";
import { MeasuredValue } from "@/components/common/measured-value";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TICKET_COPY } from "@/lib/copy/studio-order";
import type { FocusDirection } from "@/lib/domain/weekly-plan";
import type { Idea } from "@/lib/domain/intel";
import { liftPhrase } from "@/lib/plain-language";

const LABEL = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

/**
 * "Neden bu fikir": fikrin gerekçesi, kanıt alıntıları, dayandığı videolar ve planın yönü. Hepsi fikirden ve plandan OKUNUR (fişe gömülmez:
 * fiş değişse de dayanak güncel kalır). Fikir yoksa (silinmiş) tek cümle söyler; yön ölçülemediyse tire + sebep (`MeasuredValue`).
 */
export function WhyBlock({ idea, direction }: { idea: Idea | null; direction?: FocusDirection }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{TICKET_COPY.why.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {idea === null ? (
          <p className="text-sm text-muted-foreground">{TICKET_COPY.why.ideaGone}</p>
        ) : (
          <>
            <section className="flex flex-col gap-1">
              <h3 className={LABEL}>{TICKET_COPY.why.reason}</h3>
              <p className="text-sm">{idea.rationale}</p>
            </section>
            <RivalQuotes quotes={idea.details.quotes} />
            <EvidenceList evidence={idea.evidence} />
            <section className="flex flex-col gap-1">
              <h3 className={LABEL}>{TICKET_COPY.why.direction}</h3>
              {direction ? (
                <>
                  <p className="text-sm font-medium">{direction.label}</p>
                  {direction.rationale ? <p className="text-sm text-muted-foreground">{direction.rationale}</p> : null}
                  <p className="text-sm">
                    {TICKET_COPY.why.directionImpact}:{" "}
                    <MeasuredValue value={liftPhrase(direction.impact)} reason={TICKET_COPY.why.impactReason} inline />
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{TICKET_COPY.why.directionNone}</p>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
