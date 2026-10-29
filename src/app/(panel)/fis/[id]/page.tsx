import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { ProduceAction } from "@/components/studio-order/produce-action";
import { PrintTicketButton } from "@/components/studio-order/print-button";
import { RevisionBadge, RevisionHistory } from "@/components/studio-order/revision-history";
import { TicketView } from "@/components/studio-order/ticket-view";
import { WhyBlock } from "@/components/studio-order/why-block";
import { readOptional } from "@/components/weekly-plan/optional-read";
import { TICKET_COPY } from "@/lib/copy/studio-order";
import { getPanelContext } from "@/lib/data";
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { focusDirectionIndex } from "@/lib/domain/weekly-plan";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { getPlatformModule, hasPlatformModule } from "@/lib/platforms/registry";
import { ROUTES } from "@/lib/routes";
import { listWorkspaces } from "@/lib/workspace/registry";

export const metadata: Metadata = { title: "Çekim fişi" };

/**
 * Yazdırmada kabuk (menü, üst çubuk, sohbet, bildirimler) çıkmaz: fişi taşıyan her atanın fiş kökünü içermeyen çocukları gizlenir ve kaydırma
 * kutuları (`h-dvh` + `overflow`) açılır ki fiş sayfalara bölünsün. Kabuğa özel seçici yok: iki kabukta da (web, kopya) aynı kural çalışır.
 */
const PRINT_CSS = `@media print {
  :has([data-ticket-root]) { display: block !important; height: auto !important; overflow: visible !important; padding: 0 !important; }
  :has([data-ticket-root]) > :not(:has([data-ticket-root])):not([data-ticket-root]) { display: none !important; }
}`;

// Next 16: `params` bir Promise'tir.
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repo, wsId } = await getPanelContext();
  const order = await repo.getStudioOrder(wsId, id);
  if (!order) notFound();

  const idea = await repo.getIdea(wsId, order.ideaId);
  // Dayanak plandan okunur: fikrin bağlı planı, yoksa fişin hafta başı. Plan okunamazsa (henüz yok / desteklenmiyor) yön boş kalır.
  const weekStart = idea?.weeklyPlan?.weekStart ?? order.weekStart;
  const plan = weekStart ? await readOptional(() => repo.getWeeklyPlan(wsId, weekStart)) : undefined;
  const directionIndex = focusDirectionIndex(idea?.directionRef);
  const direction = directionIndex === undefined ? undefined : plan?.value?.sections.focus.directions[directionIndex];

  // Resmi gömme adresi platform modülünden (platform adıyla dallanılmaz); modül yoksa oynatıcı sunulmaz.
  const platform = idea?.platform;
  const platformLabel = platform ? PLATFORM_LABEL[platform] : "";
  const embedUrl = platform && hasPlatformModule(platform) ? getPlatformModule(platform).embedUrl(order.ticket.ornek_video?.url) : undefined;
  const panelSlug = (await listWorkspaces()).find((w) => w.id === wsId)?.slug;
  const title = idea?.title ?? order.ticket.konu ?? order.ticket.sutun;
  const timeZone = (await repo.getWorkspace(wsId))?.timezone ?? DEFAULT_TIMEZONE;

  return (
    <div data-ticket-root>
      <style>{PRINT_CSS}</style>
      <PageHeader
        title={TICKET_COPY.title}
        back={{ href: ROUTES.ideas, label: TICKET_COPY.back }}
        description={TICKET_COPY.changeHint}
        actions={<PrintTicketButton />}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <div className="print:hidden">
            <ProduceAction order={order} panelSlug={panelSlug} />
          </div>
          {order.revision > 1 ? (
            <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 print:hidden">
              <div>
                <RevisionBadge revision={order.revision} />
              </div>
              {order.ticket.revize_notu ? <p className="text-sm whitespace-pre-line">{order.ticket.revize_notu}</p> : null}
              <RevisionHistory entries={order.revisions} timeZone={timeZone} />
            </div>
          ) : null}
          <TicketView order={order} title={title} embedUrl={embedUrl} platformLabel={platformLabel} />
        </div>
        <WhyBlock idea={idea} direction={direction} />
      </div>
    </div>
  );
}
