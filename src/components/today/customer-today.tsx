import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { TODAY_COPY } from "@/lib/copy/today";
import type { PublishJob } from "@/lib/domain/publish";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { buildStoryTiles } from "@/lib/home/story-tiles";
import { planItemStatuses } from "@/lib/overview/plan-item-status";
import { ROUTES } from "@/lib/routes";
import { buildNextShare, buildWaiting, weekSentence } from "@/lib/today/customer-today";
import type { TodayInput } from "@/lib/today";

const C = TODAY_COPY.customer;
const BLOCK = "flex min-w-0 flex-col gap-2 rounded-card p-4";
const HEADING = "font-figure text-[1.0625rem] leading-tight font-semibold tracking-tight";

interface Props {
  now: Date;
  input: TodayInput;
  /** Onaylı, zamanı gelecekte yayın işleri (sayfa okur); okunamadıysa undefined. */
  scheduled: readonly PublishJob[] | undefined;
  /** Otomatik işlerin tek satırlık özeti (sayfa kurar); yoksa yalnız bağlantı. */
  automation?: string;
}

/**
 * Bugün, müşteri görünümü: dört sade blok. Senden bekleyen (sarı) · Sıradaki paylaşım · Bu hafta (tek cümle) · Otomatik (tek satır).
 * Veri Bugün'ün tek okumasından gelir; sıradaki paylaşım için sayfa var olan `listPublishJobs` okumasını ekler (okunamazsa blok "yok" der). Eşzamanlı sunucu bileşeni.
 */
export function CustomerToday({ now, input, scheduled, automation }: Props) {
  const { plan, review, currentWeekStart, pendingApproval } = input.summary;
  const timeZone = input.workspace?.timezone ?? DEFAULT_TIMEZONE;
  const waiting = buildWaiting({ pendingVideoCount: input.pendingJobs?.length ?? pendingApproval, plan });
  const next = buildNextShare(scheduled, plan, now, timeZone);
  const statuses = plan ? planItemStatuses(plan, review, currentWeekStart) : undefined;
  const week = weekSentence(buildStoryTiles({ plan, newIdeas: input.summary.newIdeas, statuses }));

  return (
    <div className="flex min-w-0 flex-col gap-4 lg:max-w-2xl" data-testid="customer-today">
      <PageHeader title="Bugün" />
      <section aria-labelledby="ct-waiting" data-testid="ct-waiting" className={`${BLOCK} bg-attention-soft text-attention-soft-ink ring-[1.5px] ring-attention-soft-edge`}>
        <h2 id="ct-waiting" className={HEADING}>
          {C.waitingHeading}
        </h2>
        {waiting ? (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-[0.9375rem] font-medium">{waiting.parts.join(" · ")}</p>
            <Link
              href={waiting.href}
              className="inline-flex min-h-tap shrink-0 items-center gap-1.5 rounded-full bg-attention px-5 text-[0.9375rem] font-semibold text-attention-ink"
            >
              {C.waitingButton}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        ) : (
          <p className="text-[0.9375rem]">{C.waitingNone}</p>
        )}
      </section>
      <section aria-labelledby="ct-next" data-testid="ct-next" className={`${BLOCK} bg-card ring-1 ring-border`}>
        <h2 id="ct-next" className={HEADING}>
          {C.nextHeading}
        </h2>
        {next ? (
          <p className="text-[0.9375rem]">
            <span className="font-semibold">{next.when}</span> · {next.title}
          </p>
        ) : (
          <p className="text-[0.9375rem] text-muted-foreground">{C.nextNone}</p>
        )}
      </section>
      {week ? (
        <section aria-labelledby="ct-week" data-testid="ct-week" className={`${BLOCK} bg-card ring-1 ring-border`}>
          <h2 id="ct-week" className={HEADING}>
            {C.weekHeading}
          </h2>
          <p className="text-[0.9375rem]">{week}</p>
        </section>
      ) : null}
      <section aria-labelledby="ct-auto" data-testid="ct-auto" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <h2 id="ct-auto" className="sr-only">
          {C.automationHeading}
        </h2>
        {automation ? <span className="text-[0.9375rem] text-muted-foreground">{automation}</span> : null}
        <Link href={ROUTES.automation} className="inline-flex min-h-tap items-center gap-1.5 text-[0.9375rem] font-semibold text-brand underline-offset-4 hover:underline">
          {C.automationLink}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    </div>
  );
}
