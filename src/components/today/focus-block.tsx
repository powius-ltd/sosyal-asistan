import { useId } from "react";

import { EvidenceLinks, resolveEvidence } from "@/components/briefing/evidence-links";
import { ConfidenceMeter } from "@/components/common/confidence-meter";
import { WhyDisclosure } from "@/components/common/why-disclosure";
import { Demirkazik } from "@/components/mascot/demirkazik";
import { DecisionActions } from "@/components/today/decision-actions";
import { TAP_CHIPS, TAP_WHY } from "@/components/today/tap";
import { TODAY_COPY } from "@/lib/copy/today";
import { dueView } from "@/lib/home/due";
import { formatNumber } from "@/lib/format";
import type { DecisionCard } from "@/lib/today";

interface FocusBlockProps {
  card: DecisionCard;
  /** Kuyruktaki sırası (1'den) ve toplam: "1/3". */
  position: number;
  total: number;
  /** Sıra etiketi: karar kuyruğunda "Karar", ilk kurulumda "Adım". */
  stepLabel: string;
  /** Çalışma alanının saat dilimi: dev saat bu dilimde yazılır. */
  timeZone: string;
  /** Hedef kitle saat dilimi (plan); farklıysa saatin altına küçük not düşer. */
  audienceTimeZone?: string;
  /** Müşteri kopyası: maskot ikonu çizilmez. */
  plain?: boolean;
}

/**
 * Bugünün baskın işi: ekranın tek gece yüzeyi. "Sıra sende" etiketi (sarı nokta Demirkazık'ta), zamanı olan kartta dev saat (zamansız
 * kartta saat bloğu çizilmez, başlık büyür), başlık, Maskot'un cümlesi ve TEK birincil düğme (sarı). "Neden?" bloğun dışında, altındadır
 * (kanıt çipleri açık zemin ister). Engel sebebi (uyum denetimi vb.) bloğun içinde görünür yazılır.
 */
export function FocusBlock({ card, position, total, stepLabel, timeZone, audienceTimeZone, plain = false }: FocusBlockProps) {
  const titleId = useId();
  const due = dueView(card.dueAt, timeZone, audienceTimeZone);
  const hasEvidence = resolveEvidence(card.evidence).length > 0;
  const heading = card.subject ?? card.title;
  const kicker = card.subject === undefined ? undefined : card.title;
  return (
    <div data-decision={card.id} data-kind={card.kind} data-lead="true" className="flex min-w-0 flex-col gap-1">
      <section
        aria-labelledby={titleId}
        className="relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-[1.25rem] bg-focus-surface p-5 text-focus-ink shadow-focus lg:p-7"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.9375rem] font-semibold">
          {plain ? null : <Demirkazik state="turn" className="size-7 [--mascot-body:var(--focus-ink)] [--mascot-part:var(--focus-ink-muted)]" />}
          <span className="text-attention">{TODAY_COPY.turnLabel}</span>
          <span className="font-normal text-focus-ink-muted">
            {kicker === undefined ? "" : `· ${kicker} `}· {stepLabel} {formatNumber(position)}/{formatNumber(total)}
          </span>
        </div>
        {due !== undefined ? (
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1 border-b border-focus-line pb-4" data-slot="due">
            <p className="font-figure text-[5.25rem]/[0.88] font-bold tracking-[-0.05em] tabular-nums lg:text-[6.5rem]/[0.88]">{due.time}</p>
            <p className="pb-1 text-base font-semibold">
              {due.weekday} · {due.date}
              <span className="block font-normal text-focus-ink-muted">{TODAY_COPY.dueCaption[card.kind] ?? TODAY_COPY.dueFallbackCaption}</span>
              {due.audienceNote !== undefined ? <span className="block text-sm font-normal text-focus-ink-muted">{due.audienceNote}</span> : null}
            </p>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 id={titleId} className="font-figure text-[1.625rem]/[1.12] font-bold tracking-[-0.025em] text-balance break-words lg:text-[1.875rem]/[1.12]">
            {heading}
          </h2>
          <p className="max-w-[60ch] text-base leading-relaxed text-focus-ink-muted">{card.body}</p>
        </div>
        {card.blockedReason !== undefined ? (
          <p className="border-l-2 border-attention pl-3 text-sm" data-slot="blocked-reason">
            <span className="font-semibold">Önce düzeltilmesi gereken: </span>
            {card.blockedReason}
          </p>
        ) : null}
        <DecisionActions primary={card.primary} secondary={card.secondary} emphasis tone="focus" />
      </section>
      {hasEvidence || card.confidence !== undefined ? (
        <WhyDisclosure label={TODAY_COPY.whyLabel} className={TAP_WHY}>
          {card.confidence !== undefined ? <ConfidenceMeter level={card.confidence} className="text-sm" /> : null}
          <div className={TAP_CHIPS}>
            <EvidenceLinks evidence={card.evidence} />
          </div>
        </WhyDisclosure>
      ) : null}
    </div>
  );
}
