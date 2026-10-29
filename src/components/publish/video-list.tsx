import { Clapperboard } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PublishJobCard, type PublishFixSettings } from "@/components/publish/job-card";
import type { PublishJobView } from "@/components/publish/job-views";
import { ROUTES } from "@/lib/routes";
import {
  VIDEO_FILTERS,
  VIDEO_FILTER_LABEL,
  videoFilterOfJob,
  type PreparingVideo,
  type VideoFilter,
  type VideoFilterCounts,
} from "@/lib/publish/video-status";
import { cn } from "@/lib/utils";

const EMPTY_TEXT: Record<VideoFilter, string> = {
  onay: "Onayını bekleyen video yok. Yeni videolar hazır olunca burada görünür.",
  hazirlaniyor: "Şu an hazırlanan video yok.",
  zamanlandi: "Zamanlanmış video yok.",
  paylasildi: "Henüz paylaşılan video yok.",
};

const timeOf = (iso: string | undefined) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);

/** Seçili süzgecin işleri: onay/zamanlanan yakın plan önce, paylaşılan en yeni önce. */
export function viewsOfFilter(views: PublishJobView[], filter: VideoFilter): PublishJobView[] {
  const picked = views.filter((v) => videoFilterOfJob(v.job) === filter);
  return filter === "paylasildi"
    ? picked.sort((a, b) => b.job.updatedAt.localeCompare(a.job.updatedAt))
    : picked.sort((a, b) => timeOf(a.job.scheduledFor) - timeOf(b.job.scheduledFor) || a.job.createdAt.localeCompare(b.job.createdAt));
}

/** "Videolar" tek listesi: 4 durum süzgeci (adreste `?durum=`, her birinde sayı) + seçili durumun kartları. */
export function VideoList({
  filter,
  counts,
  views,
  preparing,
  timeZone,
  fixSettings,
}: {
  filter: VideoFilter;
  counts: VideoFilterCounts;
  views: PublishJobView[];
  preparing: PreparingVideo[];
  timeZone: string;
  fixSettings?: PublishFixSettings;
}) {
  const shown = filter === "hazirlaniyor" ? [] : viewsOfFilter(views, filter);
  const empty = filter === "hazirlaniyor" ? preparing.length === 0 : shown.length === 0;
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Video durumu" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {VIDEO_FILTERS.map((f) => (
          <Link
            key={f}
            href={`${ROUTES.publish}?durum=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className={cn(
              "inline-flex min-h-tap shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium md:min-h-9",
              f === filter ? "border-transparent bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {VIDEO_FILTER_LABEL[f]}
            <span className="tabular-nums opacity-80">{counts[f]}</span>
          </Link>
        ))}
      </nav>

      {empty ? (
        <EmptyState icon={Clapperboard} title={VIDEO_FILTER_LABEL[filter]} description={EMPTY_TEXT[filter]} />
      ) : filter === "hazirlaniyor" ? (
        <ul className="flex flex-col gap-3">
          {preparing.map((p) => (
            <li key={p.orderId} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 text-card-foreground">
              <span className="min-w-0 truncate font-medium">{p.title}</span>
              <span className="shrink-0 rounded-full bg-preparing-soft px-2.5 py-0.5 text-xs text-preparing-soft-foreground">stüdyoda</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((view) => (
            <PublishJobCard key={view.job.id} view={view} timeZone={timeZone} fixSettings={fixSettings} />
          ))}
        </ul>
      )}
    </div>
  );
}
