import type { ReactNode } from "react";

import { MeasuredValue } from "@/components/common/measured-value";
import { ticketOpening } from "@/components/studio-order/opening";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentEmbed } from "@/components/video/content-embed";
import { ORDER_KIND_LABEL, ORDER_STATUS_LABEL, TICKET_COPY } from "@/lib/copy/studio-order";
import type { StudioOrder } from "@/lib/domain/studio-order";
import { formatDuration } from "@/lib/format";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Fiş: başlık, üretim türü, açılış, metin ya da ana hat (mod `senaryo` / `konu`), süre, örnek video (YALNIZ resmi gömme; adresi sayfa platform
 * modülünden türetip verir), not, durum. Yalnız okur: fişin dayanağı ("neden bu fikir") yanındaki ayrı blokta, plandan okunur.
 */
export function TicketView({
  order,
  title,
  embedUrl,
  platformLabel,
}: {
  order: StudioOrder;
  title: string;
  /** Örnek videonun resmi gömme adresi; platform modülü türetemediyse ya da örnek video yoksa yok. */
  embedUrl?: string;
  platformLabel: string;
}) {
  const { ticket } = order;
  const { opening, outline, note } = ticketOpening(order);
  const kind = ticket.tur ? ORDER_KIND_LABEL[ticket.tur] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label={TICKET_COPY.kind}>{kind ?? TICKET_COPY.kindMissing}</Field>
            <Field label={TICKET_COPY.status}>{ORDER_STATUS_LABEL[order.status]}</Field>
            <Field label={TICKET_COPY.column}>{ticket.sutun}</Field>
            <Field label={TICKET_COPY.wantedAt}>{ticket.istenen_saat}</Field>
            <Field label={TICKET_COPY.duration}>
              <MeasuredValue value={formatDuration(ticket.hedef_sure_sn)} reason={TICKET_COPY.durationReason} inline />
              {ticket.hedef_sure_gerekce ? <span className="mt-0.5 block text-xs text-muted-foreground">{ticket.hedef_sure_gerekce}</span> : null}
            </Field>
            {ticket.cta ? <Field label={TICKET_COPY.cta}>{ticket.cta}</Field> : null}
          </dl>

          {opening ? (
            <section className="flex flex-col gap-1">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{TICKET_COPY.opening}</h3>
              <p className="text-base font-medium">“{opening}”</p>
            </section>
          ) : null}

          {ticket.mod === "senaryo" && ticket.senaryo ? (
            <section className="flex flex-col gap-1">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{TICKET_COPY.script}</h3>
              <p className="text-sm whitespace-pre-line">{ticket.senaryo}</p>
            </section>
          ) : null}

          {ticket.mod === "konu" ? (
            <section className="flex flex-col gap-2">
              {ticket.konu ? (
                <div className="flex flex-col gap-1">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{TICKET_COPY.topic}</h3>
                  <p className="text-sm">{ticket.konu}</p>
                </div>
              ) : null}
              {outline.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{TICKET_COPY.outline}</h3>
                  <ol className="list-decimal space-y-1 pl-5 text-sm">
                    {outline.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </section>
          ) : null}

          {note ? (
            <section className="flex flex-col gap-1">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{TICKET_COPY.note}</h3>
              <p className="text-sm whitespace-pre-line text-muted-foreground">{note}</p>
            </section>
          ) : null}
        </CardContent>
      </Card>

      {ticket.ornek_video?.url ? (
        <div className="print:hidden">
          <ContentEmbed embedUrl={embedUrl} platformLabel={platformLabel} title={`${TICKET_COPY.sample} (${platformLabel})`} />
        </div>
      ) : null}
    </div>
  );
}
