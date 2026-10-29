/**
 * Müşteri görünümündeki Bugün'ün dört bloğunun saf hesabı (LLM yok, `Date.now()` yok: saat çağıranın `now`'ı).
 * Kural: ölçülemeyen (`undefined`) değer cümleye girmez; 0 uydurulmaz.
 */
import { TODAY_COPY } from "@/lib/copy/today";
import type { PublishJob } from "@/lib/domain/publish";
import type { WeeklyPlan } from "@/lib/domain/weekly-plan";
import { formatWeekdayTime } from "@/lib/format";
import { pendingVideos } from "@/lib/home/pending-videos";
import type { StoryTile } from "@/lib/home/story-tiles";
import { ROUTES } from "@/lib/routes";

export interface WaitingView {
  /** Bekleyen şeyleri söyleyen parçalar ("2 video onayını bekliyor", "Haftalık plan onayını bekliyor"). */
  parts: string[];
  /** "Bak" düğmesinin gittiği yer: önce video, sonra plan. */
  href: string;
}

/** "Senden bekleyen": onay bekleyen videolar + onaylanmamış hazır plan. Hiçbiri yoksa undefined (ekran sakin satırı çizer). */
export function buildWaiting(input: { pendingVideoCount: number | undefined; plan: WeeklyPlan | null | undefined }): WaitingView | undefined {
  const parts: string[] = [];
  let href: string | undefined;
  if (input.pendingVideoCount !== undefined && input.pendingVideoCount > 0) {
    parts.push(TODAY_COPY.videosWaiting(input.pendingVideoCount));
    href = ROUTES.publish;
  }
  if (input.plan && input.plan.status === "ready" && input.plan.approvedAt === undefined) {
    parts.push(TODAY_COPY.customer.planWaiting);
    href ??= ROUTES.thisWeek;
  }
  return href === undefined ? undefined : { parts, href };
}

export interface NextShareView {
  when: string;
  title: string;
}

/** "Sıradaki paylaşım": zamanı gelecekte olan en yakın onaylı iş. Zamanı olmayan ya da geçmişteki işe bakılmaz. */
export function buildNextShare(
  jobs: readonly PublishJob[] | undefined,
  plan: WeeklyPlan | null | undefined,
  now: Date,
  timeZone: string,
): NextShareView | undefined {
  const upcoming = (jobs ?? [])
    .filter((job) => job.scheduledFor !== undefined && new Date(job.scheduledFor).getTime() > now.getTime())
    .sort((a, b) => new Date(a.scheduledFor ?? 0).getTime() - new Date(b.scheduledFor ?? 0).getTime());
  const first = upcoming[0];
  if (first?.scheduledFor === undefined) return undefined;
  const when = formatWeekdayTime(first.scheduledFor, timeZone);
  const title = pendingVideos([first], plan)[0]?.title;
  return when === undefined || title === undefined ? undefined : { when, title };
}

/** "Bu hafta" tek cümlesi: ölçülmüş ilk rakamlı cümle (yön, sonra fikir sayısı, sonra sonuç). Hiçbiri ölçülmediyse undefined. */
export function weekSentence(tiles: readonly [StoryTile, StoryTile, StoryTile]): string | undefined {
  const [found, times, result] = tiles;
  for (const tile of [times, found, result]) {
    if (tile.figure !== undefined && tile.figure !== "0") return tile.sentence;
  }
  return undefined;
}
