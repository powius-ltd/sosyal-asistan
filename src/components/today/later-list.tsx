import { ChevronDown } from "lucide-react";

import { EvidenceLinks, resolveEvidence } from "@/components/briefing/evidence-links";
import { ConfidenceMeter } from "@/components/common/confidence-meter";
import { WhyDisclosure } from "@/components/common/why-disclosure";
import { Demirkazik } from "@/components/mascot/demirkazik";
import { DecisionActions } from "@/components/today/decision-actions";
import { TAP_CHIPS, TAP_WHY } from "@/components/today/tap";
import { TODAY_COPY } from "@/lib/copy/today";
import { dueView } from "@/lib/home/due";
import type { DecisionCard } from "@/lib/today";

interface LaterListProps {
  /** Baskın karar DIŞINDAKİ kartlar (sıra mantık katmanından gelir). */
  cards: readonly DecisionCard[];
  timeZone: string;
  audienceTimeZone?: string;
  /** Müşteri kopyası: başlıkta maskot ikonu çizilmez. */
  plain?: boolean;
}

/**
 * "Sonra": baskın işin altında sessiz satırlar (kart değil, ince çizgi). Her satır yerinde açılır (`<details>`, JS yok): kapalıyken yalnız
 * başlık + tek satır özet (+ zamanı varsa gün/saat); açılınca cümle, düğmeler ve "Neden?" görünür. Sarı kullanılmaz: sıra yalnız baskın işte.
 */
export function LaterList({ cards, timeZone, audienceTimeZone, plain = false }: LaterListProps) {
  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="today-later-heading" data-testid="today-later" className="flex min-w-0 flex-col">
      <h2 id="today-later-heading" className="flex items-center gap-2.5 text-[0.9375rem] font-semibold text-muted-foreground">
        {plain ? null : <Demirkazik state="waiting" className="size-5" />}
        {TODAY_COPY.laterHeading}
      </h2>
      <ol className="mt-1 flex min-w-0 flex-col">
        {cards.map((card) => (
          <LaterRow key={card.id} card={card} timeZone={timeZone} audienceTimeZone={audienceTimeZone} />
        ))}
      </ol>
    </section>
  );
}

function LaterRow({ card, timeZone, audienceTimeZone }: { card: DecisionCard; timeZone: string; audienceTimeZone?: string }) {
  const due = dueView(card.dueAt, timeZone, audienceTimeZone);
  const hasEvidence = resolveEvidence(card.evidence).length > 0;
  return (
    <li data-decision={card.id} data-kind={card.kind} data-lead="false" className="min-w-0 border-t">
      <details className="group/row min-w-0">
        <summary className="flex min-h-[4.25rem] cursor-pointer list-none items-center gap-3 rounded-md py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <b className="block text-base leading-snug font-semibold break-words">
              {card.subject ?? card.title}
            </b>
            <small className="mt-0.5 line-clamp-1 text-[0.9375rem] text-muted-foreground">{card.subject === undefined ? card.body : card.title}</small>
          </span>
          {due !== undefined ? (
            <span className="shrink-0 text-right font-figure text-[1.0625rem]/[1.1] font-bold tabular-nums" data-slot="due">
              {due.time}
              <i className="block font-sans text-[0.8125rem] font-normal text-muted-foreground not-italic">{due.weekday}</i>
            </span>
          ) : null}
          <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-fast ease-out group-open/row:rotate-180" aria-hidden />
        </summary>
        <div className="flex min-w-0 flex-col gap-3 pb-4">
          <p className="max-w-[60ch] font-voice text-base leading-relaxed">{card.body}</p>
          {card.blockedReason !== undefined ? (
            <p className="border-l-2 border-destructive pl-3 text-sm" data-slot="blocked-reason">
              <span className="font-medium">Önce düzeltilmesi gereken: </span>
              {card.blockedReason}
            </p>
          ) : null}
          <DecisionActions primary={card.primary} secondary={card.secondary} emphasis={false} />
          {hasEvidence || card.confidence !== undefined ? (
            <WhyDisclosure label={TODAY_COPY.whyLabel} className={TAP_WHY}>
              {card.confidence !== undefined ? <ConfidenceMeter level={card.confidence} className="text-sm" /> : null}
              <div className={TAP_CHIPS}>
                <EvidenceLinks evidence={card.evidence} />
              </div>
            </WhyDisclosure>
          ) : null}
        </div>
      </details>
    </li>
  );
}
