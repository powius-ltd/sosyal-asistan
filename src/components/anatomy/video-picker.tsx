import Link from "next/link";

import { LiftBadge } from "@/components/common/lift-badge";
import { Badge } from "@/components/ui/badge";
import type { AnatomyVideoRef } from "@/lib/domain/anatomy";
import { ANATOMY_PLAIN } from "@/lib/anatomy/plain";
import { anatomyFor } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Video seçici: incelenmiş videolar normaline göre sonuca göre sıralı (rapor sırası), seçim `?video=<id>` adresiyle (bağlantı; istemci durumu yok).
 * Normaline göre sonucu ölçülemeyen video listenin sonundadır ve tire + sebep gösterir.
 */
export function VideoPicker({ videos, selectedId }: { videos: readonly AnatomyVideoRef[]; selectedId?: string }) {
  return (
    <nav aria-label={ANATOMY_PLAIN.pickerLabel} className="rounded-xl border">
      <ul className="flex max-h-[34rem] flex-col divide-y overflow-y-auto">
        {videos.map((video) => {
          const selected = video.contentItemId === selectedId;
          return (
            <li key={video.contentItemId}>
              <Link
                href={anatomyFor(video.contentItemId)}
                scroll={false}
                aria-current={selected ? "page" : undefined}
                className={cn("flex min-h-tap items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/60 md:min-h-0", selected && "bg-muted")}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">@{video.ownerHandle}</span>
                    <Badge variant={video.isOwn ? "default" : "secondary"}>{video.isOwn ? ANATOMY_PLAIN.own : ANATOMY_PLAIN.rival}</Badge>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{video.caption ?? ANATOMY_PLAIN.noCaption}</span>
                </span>
                <LiftBadge lift={video.currentLift} liftTier={video.liftTier} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
