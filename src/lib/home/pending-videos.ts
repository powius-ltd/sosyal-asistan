/**
 * "Videoların" kartının satırları: onay bekleyen yayın işleri. Ad: işin fikri plandaysa fikrin başlığı, değilse açıklamasının başı; ikisi de
 * yoksa sabit bir ad (uydurma başlık yok). Saf.
 */
import type { WeeklyPlan } from "@/lib/domain/weekly-plan";
import { TODAY_COPY } from "@/lib/copy/today";
import { truncateText } from "@/lib/text";
import type { TodayPublishJob } from "@/lib/today";

const TITLE_MAX_CHARS = 90;

export interface PendingVideo {
  id: string;
  /** Videonun adı (plandaki fikir başlığı ya da açıklamasının başı). */
  title: string;
}

export function pendingVideos(jobs: readonly TodayPublishJob[] | undefined, plan: WeeklyPlan | null | undefined): PendingVideo[] {
  if (jobs === undefined) return [];
  const ideas = plan ? [...plan.items, ...plan.alternatives] : [];
  return jobs.map((job) => {
    const planned = job.ideaId === undefined ? undefined : ideas.find((item) => item.ideaId === job.ideaId)?.idea.title;
    const caption = (job.caption ?? "").trim();
    return { id: job.id, title: planned ?? (caption === "" ? TODAY_COPY.videoFallbackTitle : truncateText(caption, TITLE_MAX_CHARS)) };
  });
}
