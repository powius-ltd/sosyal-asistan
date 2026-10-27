import { SaveToCollectionButton } from "@/components/collections/save-to-collection-button";
import { ContentLink } from "@/components/common/content-link";
import { FormatBadge } from "@/components/common/format-badge";
import { LiftBadge } from "@/components/common/lift-badge";
import { PlatformBadge } from "@/components/common/platform-badge";
import { AdOrganicBadge } from "@/components/outliers/ad-organic-badge";
import { captionPreview } from "@/components/outliers/caption";
import { CoverPlaceholder } from "@/components/outliers/cover-placeholder";
import {
  OwnerFollowers,
  ViewsPerFollowerLabel,
  ViewsPerFollowerValue,
  ViewsWithIcon,
} from "@/components/outliers/outlier-metrics";
import { Card } from "@/components/ui/card";
import type { ContentItem } from "@/lib/domain/content";
import type { OrganicAdMark } from "@/lib/matrix/ad-organic";
import { formatDate, formatDuration } from "@/lib/format";
import { OUTLIERS_PLAIN, VS_NORMAL } from "@/lib/plain-language-results";

/** Tutan içerik kartı: kapak yer tutucu, hesap, kısaltılmış alt yazı, izlenme + normaline göre + izlenme/takipçi. */
export function OutlierCard({
  item,
  timeZone,
  initialCollectionIds,
  adMark,
}: {
  item: ContentItem;
  timeZone?: string;
  /** Üye olduğu koleksiyon kimlikleri ("Kaydet" düğmesinin ilk durumu; bilinmiyorsa undefined). */
  initialCollectionIds?: string[];
  /** Reklam işareti (yalnız yönetici modunda, kendi içerik için verilir). */
  adMark?: OrganicAdMark;
}) {
  const caption = captionPreview(item.caption);
  const duration = formatDuration(item.durationSec);

  return (
    <Card size="sm" className="gap-0 py-0" data-content-id={item.id}>
      <div className="relative">
        <CoverPlaceholder format={item.format} className="h-28 w-full" />
        <div className="absolute top-2 left-2 flex gap-1">
          <FormatBadge format={item.format} />
        </div>
        {duration ? (
          <span className="absolute right-2 bottom-2 rounded bg-background/80 px-1.5 py-0.5 font-mono text-xs tabular">
            {duration}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium">@{item.owner.handle}</div>
            <div className="text-xs text-muted-foreground">
              <OwnerFollowers followers={item.owner.followers} />
            </div>
          </div>
          <PlatformBadge platform={item.platform} />
        </div>

        {adMark !== undefined ? (
          <div>
            <AdOrganicBadge mark={adMark} />
          </div>
        ) : null}

        <p className="line-clamp-3 min-h-[3.75rem] text-sm text-muted-foreground">
          {caption ?? <span className="italic">{OUTLIERS_PLAIN.noCaption}</span>}
        </p>

        <dl className="grid grid-cols-3 items-center gap-2 border-t pt-2.5 text-xs">
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">İzlenme</dt>
            <dd>
              <ViewsWithIcon item={item} />
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">{VS_NORMAL.column}</dt>
            <dd>
              <LiftBadge {...item.score} />
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">
              <ViewsPerFollowerLabel />
            </dt>
            <dd>
              <ViewsPerFollowerValue item={item} />
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{formatDate(item.publishedAt, timeZone) ?? "Yayın tarihi yok"}</span>
          {/* Dış bağlantı simgesi yok: bu bağlantı aynı sekmede video sayfasını açar (platform bağlantısı video sayfasındadır). */}
          <ContentLink id={item.id} className="text-foreground max-md:min-h-tap max-md:items-center">
            {OUTLIERS_PLAIN.analysis}
          </ContentLink>
        </div>
        <div className="flex justify-end">
          <SaveToCollectionButton contentId={item.id} initialCollectionIds={initialCollectionIds} />
        </div>
      </div>
    </Card>
  );
}
