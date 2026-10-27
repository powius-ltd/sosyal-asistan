import Link from "next/link";

import { EntryLine } from "@/components/entry/entry-line";
import { EntryVideos } from "@/components/entry/entry-videos";
import type { PanelRepository } from "@/lib/data/repository";
import { ENTRY_COPY as COPY } from "@/lib/copy/entry";
import { deriveEntry } from "@/lib/entry/derive";
import { loadEntryInput } from "@/lib/entry/load";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import type { TodayInput } from "@/lib/today/types";

interface Props {
  repo: PanelRepository;
  wsId: string;
  now: Date;
  /** Bugün'ün zaten okuduğu veri (plan, son toplama, saat dilimi): yeniden okunmaz. */
  today: Pick<TodayInput, "summary" | "workspace">;
}

/**
 * Giriş ekranı (müşteri kopyasının açılış sayfası; kullanıcı kararı 2026-10-27): yukarıda 7 adımlı hat, altında haftanın videoları ve
 * her birinin tek işi; ayrıntılar alt sekmelerde. Çoğu iş sohbetle yürür ("Asistan'a söyle"). Sunucu bileşeni; istemci yaprakları
 * yalnız düğmeler.
 */
export async function EntryScreen({ repo, wsId, now, today }: Props) {
  const view = deriveEntry(await loadEntryInput({ repo, wsId, now, today }));
  const timeZone = today.workspace?.timezone ?? DEFAULT_TIMEZONE;
  const D = COPY.details;
  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="entry-screen">
      <EntryLine steps={view.steps} />
      <EntryVideos videos={view.videos} timeZone={timeZone} />
      <nav aria-label={D.heading} className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span className="font-medium">{D.heading}:</span>
        <Link href={ROUTES.thisWeek} className="underline underline-offset-4">{D.plan}</Link>
        <Link href={ROUTES.ideas} className="underline underline-offset-4">{D.ideas}</Link>
        <Link href={ROUTES.results} className="underline underline-offset-4">{D.results}</Link>
      </nav>
    </div>
  );
}
