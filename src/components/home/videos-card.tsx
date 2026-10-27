import { Play } from "lucide-react";
import Link from "next/link";

import { TODAY_COPY } from "@/lib/copy/today";
import type { PendingVideo } from "@/lib/home/pending-videos";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Yol çubuğunun basamak çizgisi: hazırlandı (yeşil) · onayın (sarı, şimdi) · yayın (sönük). */
const ROAD_TONE = ["border-success", "border-attention font-semibold", "border-attention-soft-edge opacity-80"] as const;

/**
 * "Videoların": onayını bekleyen videolar (yayın işi `awaiting_approval`). Satır yayın ekranına bağlanır; orada izlenir ve onaylanır
 * (onay insan kararıdır, burada onaylanmaz). Yol çubuğu: Hazırlandı → Onayın (şimdi) → Yayın. Onay bekleyen video yoksa bölüm çizilmez.
 */
export function VideosCard({ videos }: { videos: readonly PendingVideo[] }) {
  if (videos.length === 0) return null;
  return (
    <section aria-labelledby="today-videos-heading" data-testid="today-videos" className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="today-videos-heading" className="font-figure text-[1.1875rem] leading-tight font-semibold tracking-tight">
          {TODAY_COPY.videosHeading}
        </h2>
        <span className="text-sm text-muted-foreground">{TODAY_COPY.videosWaiting(videos.length)}</span>
      </div>
      <ul className="flex min-w-0 flex-col gap-2.5">
        {videos.map((video) => (
          <li key={video.id}>
            <Link
              href={ROUTES.publish}
              className="grid min-w-0 grid-cols-[4.125rem_minmax(0,1fr)] items-center gap-3.5 rounded-card bg-attention-soft p-3 text-attention-soft-ink ring-[1.5px] ring-attention-soft-edge transition-transform duration-fast active:scale-[0.985] lg:max-w-[38.75rem]"
            >
              <span aria-hidden className="grid aspect-[9/16] place-items-center rounded-[0.5625rem] bg-player-surface text-player-ink ring-1 ring-player-edge">
                <Play className="size-5 fill-current" />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                  <span aria-hidden className="size-[0.5625rem] rounded-full bg-attention ring-1 ring-attention-pressed" />
                  {TODAY_COPY.videoWaitingChip}
                </span>
                <span className="line-clamp-2 leading-snug font-semibold break-words">{video.title}</span>
                <small className="text-sm opacity-90">{TODAY_COPY.videoHint}</small>
                <ol aria-label={TODAY_COPY.videoRoadLabel} className="mt-1.5 grid grid-cols-3 gap-1 text-[0.8125rem] leading-tight">
                  {TODAY_COPY.videoRoad.map((step, index) => (
                    <li key={step} className={cn("border-t-4 pt-1.5", ROAD_TONE[index])}>
                      {step}
                    </li>
                  ))}
                </ol>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
