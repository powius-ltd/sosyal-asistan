import Link from "next/link";

import { KindChoice } from "@/components/entry/kind-choice";
import { WeeklyFlowActionButton } from "@/components/weekly-flow/weekly-flow-actions";
import { buttonVariants } from "@/components/ui/button";
import { ENTRY_COPY as COPY } from "@/lib/copy/entry";
import type { EntryStage, EntryVideo } from "@/lib/entry/types";
import { formatWeekdayTime } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { truncateText } from "@/lib/text";
import { cn } from "@/lib/utils";

/** Gerekçe satırı kısa kalır; tamamı "Planın tüm nedenleri"nde. */
const RATIONALE_MAX = 180;

const CHIP: Record<EntryStage, string> = {
  approve: "bg-attention-soft text-attention-soft-ink",
  script: "bg-plan-soft text-plan-soft-foreground",
  produce: "bg-preparing-soft text-preparing-soft-foreground",
  share: "bg-ready-soft text-ready-soft-foreground",
  track: "bg-success-soft text-success-soft-foreground",
};

const BTN = "min-h-tap md:min-h-9";
const chatNote = COPY.card.chatUnavailable;

function VideoActions({ video }: { video: EntryVideo }) {
  const A = COPY.card.actions;
  const order = video.order;
  switch (video.stage) {
    case "approve":
      return (
        <>
          <KindChoice ideaId={video.ideaId} />
          <WeeklyFlowActionButton action={{ kind: "chat", message: COPY.chat.discuss(video.title) }} label={A.discuss} unavailableNote={chatNote} />
        </>
      );
    case "script":
      return (
        <>
          {order ? (
            <Link href={ROUTES.ticket(order.id)} className={cn(buttonVariants({ variant: "default" }), BTN)}>
              {A.openScript}
            </Link>
          ) : null}
          <WeeklyFlowActionButton action={{ kind: "chat", message: COPY.chat.script(video.title) }} label={A.changeScript} unavailableNote={chatNote} />
        </>
      );
    case "produce":
    case "share":
      return order ? (
        <Link href={ROUTES.ticket(order.id)} className={cn(buttonVariants({ variant: "outline" }), BTN)}>
          {A.openTicket}
        </Link>
      ) : null;
    case "track":
      return (
        <Link href={ROUTES.results} className={cn(buttonVariants({ variant: "outline" }), BTN)}>
          {A.results}
        </Link>
      );
  }
}

/** Haftanın plan videoları: her satırda başlık, paylaşım günü, neden, aşama ve o aşamanın TEK işi. Sonda "değiştirmek istediğin…". */
export function EntryVideos({ videos, timeZone }: { videos: readonly EntryVideo[]; timeZone: string }) {
  const C = COPY.card;
  return (
    <section aria-labelledby="entry-videos-heading" data-testid="entry-videos" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="entry-videos-heading" className="text-xl font-semibold tracking-tight">
          {C.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{videos.length > 0 ? C.lead : C.empty}</p>
      </div>
      {videos.length > 0 ? (
        <ol className="flex min-w-0 flex-col gap-3">
          {videos.map((v, i) => {
            const when = formatWeekdayTime(v.slotAt, timeZone);
            const chosen = v.order?.kind === undefined ? undefined : v.order.kind === "ugc" ? C.chosen.ugc : C.chosen.studio;
            return (
              <li key={v.ideaId} data-stage={v.stage} className={cn("flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4", v.stage === "approve" && "border-attention-soft-edge")}>
                <div className="flex min-w-0 items-start gap-3">
                  <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="font-semibold leading-snug break-words">{v.title}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className={cn("rounded-full px-2 py-0.5 font-medium", CHIP[v.stage])}>{C.stage[v.stage]}</span>
                      {chosen ? <span>{chosen}</span> : null}
                      {when ? (
                        <span>
                          {C.when}: {when}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                {v.rationale ? <p className="text-sm leading-relaxed break-words text-muted-foreground">{truncateText(v.rationale, RATIONALE_MAX)}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <VideoActions video={v} />
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      {videos.some((v) => v.stage === "approve") ? <p className="text-xs text-muted-foreground">{C.choiceHint}</p> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-dashed p-4">
        <p className="text-[0.9375rem] font-medium">{C.change}</p>
        <WeeklyFlowActionButton action={{ kind: "chat", message: COPY.chat.change }} label={C.changeButton} primary unavailableNote={chatNote} />
        <Link href={ROUTES.thisWeek} className="text-sm text-muted-foreground underline underline-offset-4">
          {C.why}
        </Link>
      </div>
    </section>
  );
}
