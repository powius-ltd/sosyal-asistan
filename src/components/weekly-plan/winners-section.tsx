import type { ReactNode } from "react";

import { ContentLink } from "@/components/common/content-link";
import { Hint } from "@/components/common/hint";
import { LiftBadge } from "@/components/common/lift-badge";
import { MeasuredValue } from "@/components/common/measured-value";
import { PlanNote, PlanSection } from "@/components/weekly-plan/plan-section";
import { QuoteBlock } from "@/components/weekly-plan/quote-block";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TAP_LINKS } from "@/components/weekly-plan/tap-target";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import type { PlanWinner, WinnersSection } from "@/lib/domain/weekly-plan";
import { DEFAULT_TIMEZONE, formatCompact, formatDate, formatDuration } from "@/lib/format";
import { plainOrFallback, WINNERS_PLAIN } from "@/lib/plain-language-plan";

/** Açılış tarzı yoksa sebep: video hiç incelenmemiş ile incelenmiş ama doğrulanamamış ayrışır. */
const noOpeningReason = (winner: PlanWinner): string => (winner.evidenceUnverified ? WINNERS_PLAIN.unverified : WINNERS_PLAIN.notAnalyzed);

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt>{label}</dt>
      <dd className="font-medium text-foreground">{children}</dd>
    </div>
  );
}

function WinnerCard({ winner }: { winner: PlanWinner }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <ContentLink id={winner.contentItemId} className={TAP_LINKS}>
            @{winner.ownerHandle}
          </ContentLink>
          <LiftBadge lift={winner.lift} />
        </div>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Meta label="İzlenme">
            <MeasuredValue value={winner.views} format={formatCompact} reason="Platform izlenme sayısını vermedi." />
          </Meta>
          <Meta label="Süre">
            <MeasuredValue value={winner.durationSec} format={formatDuration} reason="Süre bilgisi yok." />
          </Meta>
          <Meta label={WINNERS_PLAIN.openingLabel}>
            {winner.hookType ? hookTypeLabel(winner.hookType) : <MeasuredValue value={undefined} reason={noOpeningReason(winner)} />}
          </Meta>
          <Meta label="Tarih">
            <MeasuredValue value={formatDate(winner.publishedAt, DEFAULT_TIMEZONE)} reason="Yayın tarihi yok." />
          </Meta>
        </dl>
        {winner.why ? (
          <p className="text-sm">{winner.why}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {winner.analyzed
              ? WINNERS_PLAIN.noWhy
              : winner.evidenceUnverified
                ? WINNERS_PLAIN.unverifiedWhy
                : `${WINNERS_PLAIN.notAnalyzed} İncelendikten sonra “neden tuttu” gelir.`}
          </p>
        )}
        {winner.quote ? <QuoteBlock quote={winner.quote} /> : null}
      </CardContent>
    </Card>
  );
}

function WinnerGroup({
  title,
  criteria,
  winners,
  emptyText,
  badge,
}: {
  title: string;
  criteria: string;
  winners: PlanWinner[];
  emptyText: string;
  badge?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{criteria}</span>
        {badge}
      </div>
      {winners.length === 0 ? (
        <PlanNote>{emptyText}</PlanNote>
      ) : (
        <ul className="flex flex-col gap-3">
          {winners.map((winner) => (
            <li key={winner.contentItemId}>
              <WinnerCard winner={winner} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Bölüm 1 — Ne tuttu: rakipte son 30 gün normalinin ≥ 3 katı (azsa ≥ 2 katı, işaretli), kendi hesapta son 90 gün ≥ 1,5 katı. */
export function WinnersSectionView({ winners }: { winners: WinnersSection }) {
  const emptyText = plainOrFallback(winners.unmeasuredReason, WINNERS_PLAIN.noneInPeriod);
  return (
    <PlanSection id="winners" title="Ne tuttu" description="Planın dayandığı tutan içerikler: neden tuttuğu alıntıyla birlikte.">
      <div className="grid gap-6 lg:grid-cols-2">
        <WinnerGroup
          title="Rakiplerde"
          criteria={WINNERS_PLAIN.criteria(30, winners.relaxedThreshold ? 2 : 3)}
          winners={winners.rivals}
          emptyText={emptyText}
          badge={
            winners.relaxedThreshold ? (
              <Hint content={WINNERS_PLAIN.relaxedHint(2)} label={WINNERS_PLAIN.relaxedBadge}>
                <Badge variant="outline">{WINNERS_PLAIN.relaxedBadge}</Badge>
              </Hint>
            ) : null
          }
        />
        <WinnerGroup
          title="Senin hesabında"
          criteria={WINNERS_PLAIN.criteria(90, 1.5)}
          winners={winners.own}
          emptyText={winners.own.length === 0 && winners.rivals.length > 0 ? WINNERS_PLAIN.noOwn : emptyText}
        />
      </div>
    </PlanSection>
  );
}
