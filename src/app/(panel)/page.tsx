import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/common/page-header";
import { EntryScreen } from "@/components/entry/entry-screen";
import { StoryTiles } from "@/components/home/story-tiles";
import { VideosCard } from "@/components/home/videos-card";
import { WeekSection } from "@/components/home/week-section";
import { WeeklyFlowStrip } from "@/components/weekly-flow/weekly-flow-strip";
import { overviewDescription } from "@/components/overview/header-description";
import { FocusBlock } from "@/components/today/focus-block";
import { LaterList } from "@/components/today/later-list";
import { TodayCalm } from "@/components/today/today-calm";
import { loadTodayData } from "@/components/today/today-data";
import { TAP_INNER_LINKS } from "@/components/today/tap";
import { TodayVoice } from "@/components/today/today-voice";
import { maskotName } from "@/lib/agents/persona";
import { ENTRY_COPY } from "@/lib/copy/entry";
import { TODAY_COPY } from "@/lib/copy/today";
import { getPanelContext } from "@/lib/data";
import { isCopyEdition } from "@/lib/edition";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { pendingVideos } from "@/lib/home/pending-videos";
import { buildStoryTiles } from "@/lib/home/story-tiles";
import { voiceMascotState } from "@/lib/mascot/state";
import { planItemStatuses } from "@/lib/overview/plan-item-status";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Bugün" };

/**
 * Bugün (ana ekran): Demirkazık'ın tek cümlesi → bugünün TEK baskın işi (gece bloğu, zamanı varsa dev saat) → altında sessiz "Sonra" →
 * 7 günlük hafta şeridi → cümleli üç rakam → onay bekleyen videolar → "Sonuçlar" bağlantısı. Telefonda tek akış; geniş
 * ekranda solda karar, sağda rakamlar. Hepsi tek okumadan beslenir (`loadTodayData` → `loadTodayInput`: söz, kuyruk, plan, sonuç, notlar, onay bekleyen
 * yayınlar; istek başına tek okuma, sağ alttaki sohbet düğmesinin karar noktasıyla paylaşılır). Soru kutusu sayfada değil, her sayfada olan
 * yüzen sohbet düğmesindedir (`components/chat`); sayılar, grafikler ve son tutanlar `/sonuclar`'dadır. Yönetici bilgisi (iş düğmeleri, para konuşan kartlar) yalnız operatör
 * modunda görünür.
 */
export default async function TodayPage() {
  const [{ now, operator, input, jobs, today }, { repo, wsId }] = await Promise.all([loadTodayData(), getPanelContext()]);
  const { plan, review, currentWeekStart, newIdeas } = input.summary;
  const timeZone = input.workspace?.timezone ?? DEFAULT_TIMEZONE;
  const audienceTimeZone = plan?.sections.schedule.audienceTimeZone;
  const statuses = plan ? planItemStatuses(plan, review, currentWeekStart) : undefined;
  const name = maskotName();
  // Müşteri kopyası: Demirkazık yok; yayın kapalı olduğundan onay bekleyen videolar kartı da yok.
  const plain = isCopyEdition();
  const setup = today.state.kind === "empty";
  const [focus, ...later] = today.queue;
  const voice = (
    <TodayVoice
      voice={today.voice}
      state={today.state}
      maskotName={name}
      plain={plain}
      mascot={voiceMascotState({ decisions: today.queue.length, busy: jobs?.busy === true })}
      now={now}
      caption={overviewDescription({ lastCollectedAt: input.summary.lastCollectedAt, briefing: null, now, timeZone })}
    />
  );

  // Müşteri kopyası: açılış giriş ekranıdır (7 adımlı hat + haftanın videoları; kullanıcı kararı 2026-10-27). Kurulum bitmemişse eski akış.
  if (plain && !setup) {
    return (
      <div className="flex min-w-0 flex-col gap-6 lg:gap-7">
        <PageHeader title={ENTRY_COPY.title} />
        <EntryScreen repo={repo} wsId={wsId} now={now} today={input} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-7 lg:gap-8">
      {voice}
      <Suspense fallback={null}>
        <WeeklyFlowStrip repo={repo} wsId={wsId} now={now} today={input} />
      </Suspense>
      <div className="grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1.22fr)_minmax(0,1fr)] lg:items-start lg:gap-x-8" data-testid="today-main">
        <div className="flex min-w-0 flex-col gap-7" data-testid="today-queue">
          {focus ? (
            <FocusBlock
              card={focus}
              position={1}
              total={today.queue.length}
              stepLabel={setup ? "Adım" : "Karar"}
              timeZone={timeZone}
              audienceTimeZone={audienceTimeZone}
              plain={plain}
            />
          ) : (
            <TodayCalm text={today.state.text} maskotName={name} plain={plain} />
          )}
          <LaterList cards={later} timeZone={timeZone} audienceTimeZone={audienceTimeZone} plain={plain} />
        </div>
        <div className="flex min-w-0 flex-col gap-7">
          <StoryTiles tiles={buildStoryTiles({ plan, newIdeas, statuses })} />
        </div>
      </div>
      {/* Hafta şeridinin bağlantısı ortak bileşende 44 px; dar ekranda 48'e burada çıkar. */}
      <div className={TAP_INNER_LINKS}>
        <WeekSection plan={plan} statuses={statuses} timeZone={timeZone} operator={operator} />
      </div>
      {plain ? null : <VideosCard videos={pendingVideos(input.pendingJobs, plan)} />}
      <Link
        href={ROUTES.results}
        aria-label={TODAY_COPY.detailsAria}
        className="inline-flex min-h-tap w-fit items-center gap-1.5 text-[0.9375rem] font-semibold text-brand underline-offset-4 hover:underline"
      >
        {TODAY_COPY.detailsLink}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
