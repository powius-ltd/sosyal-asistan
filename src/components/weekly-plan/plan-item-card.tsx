import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { ContentLink } from "@/components/common/content-link";
import { LiftBadge } from "@/components/common/lift-badge";
import { TicketButton } from "@/components/studio-order/ticket-button";
import { ReviseIdeaButton } from "@/components/weekly-plan/revise-idea-button";
import { QuoteBlock } from "@/components/weekly-plan/quote-block";
import { SlotTime } from "@/components/weekly-plan/slot-time";
import { TAP, TAP_LINKS } from "@/components/weekly-plan/tap-target";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { REVISABLE_STATUSES } from "@/lib/data/idea-revision-input";
import type { IdeaEvidence } from "@/lib/domain/intel";
import type { WeeklyPlanItem } from "@/lib/domain/weekly-plan";
import { formatDuration } from "@/lib/format";
import { IDEA_PLAIN, OPENING_PLAIN } from "@/lib/plain-language-plan";
import { cn } from "@/lib/utils";

function Label({ children }: { children: ReactNode }) {
  return <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h4>;
}

function EvidenceRow({ evidence }: { evidence: IdeaEvidence }) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <ContentLink id={evidence.contentItemId} externalUrl={evidence.url} className={TAP_LINKS}>
        @{evidence.ownerHandle}
        {evidence.caption ? ` · ${evidence.caption}` : ""}
      </ContentLink>
      <LiftBadge lift={evidence.currentLift} className="shrink-0" />
    </li>
  );
}

/** Açılır bölüm: script (yoksa taslak maddeleri), açıklama taslağı ve kullanılan rakip alıntıları. */
function ScriptDetails({ item }: { item: WeeklyPlanItem }) {
  const { idea } = item;
  const { script, captionDraft, quotes } = idea.details;
  return (
    <details className="group rounded-lg border bg-muted/30 px-3 py-2">
      <summary className={cn("flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium [&::-webkit-details-marker]:hidden", TAP)}>
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
        Script ve açıklama taslağı
      </summary>
      <div className="mt-3 flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1.5">
          <Label>Script</Label>
          {script ? (
            <p className="whitespace-pre-line">{script}</p>
          ) : idea.scriptOutline.length > 0 ? (
            <ol className="list-decimal space-y-1 pl-5">
              {idea.scriptOutline.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground">Script henüz yazılmadı.</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Açıklama taslağı</Label>
          {captionDraft ? (
            <p className="whitespace-pre-line">{captionDraft}</p>
          ) : (
            <p className="text-muted-foreground">Açıklama taslağı yok.</p>
          )}
        </div>
        {quotes && quotes.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label>Dayanılan rakip alıntıları</Label>
            {quotes.map((quote) => (
              <QuoteBlock key={`${quote.contentItemId}:${quote.text}`} quote={quote} />
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

/** Plana alınan içerik: sıra, slot zamanı, başlık, açılış cümleleri, açılır script, dayandığı videolar. */
export function PlanItemCard({ item, audienceTimeZone, orderId }: { item: WeeklyPlanItem; audienceTimeZone: string; orderId?: string }) {
  const { idea } = item;
  const { ownTried, targetDurationSec } = idea.details;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          {item.position !== undefined ? (
            <span
              className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular"
              aria-label={`${item.position}. içerik`}
            >
              {item.position}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-snug">{idea.title}</h3>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
              <SlotTime at={item.slotAt} audienceTimeZone={audienceTimeZone} />
              {item.slotNote ? <span className="text-xs text-muted-foreground">{item.slotNote}</span> : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {idea.hookType ? <Badge variant="secondary">{OPENING_PLAIN.badge(idea.hookType)}</Badge> : null}
            {ownTried === false ? <Badge variant="outline">Yeni yön</Badge> : null}
            {targetDurationSec !== undefined ? (
              <Badge variant="outline" className="tabular">
                {formatDuration(targetDurationSec)}
              </Badge>
            ) : null}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{idea.rationale}</p>

        <div className="flex flex-col gap-1.5">
          <Label>{OPENING_PLAIN.options}</Label>
          {idea.hooks.length > 0 ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {idea.hooks.map((hook, index) => (
                <li key={index}>{hook}</li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">{OPENING_PLAIN.notProduced}</p>
          )}
        </div>

        <ScriptDetails item={item} />

        <div className="flex flex-col gap-1.5">
          <Label>{IDEA_PLAIN.evidenceTitle}</Label>
          {idea.evidence.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {idea.evidence.map((evidence) => (
                <EvidenceRow key={evidence.contentItemId} evidence={evidence} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{IDEA_PLAIN.noEvidence}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <TicketButton ideaId={idea.id} orderId={orderId} />
          {REVISABLE_STATUSES.includes(idea.status) ? <ReviseIdeaButton title={idea.title} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}
