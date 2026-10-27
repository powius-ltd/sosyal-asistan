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
  ViewsValue,
} from "@/components/outliers/outlier-metrics";
import { ScrollTable } from "@/components/common/scroll-hint";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ContentItem } from "@/lib/domain/content";
import type { OrganicAdMarks } from "@/lib/matrix/ad-organic";
import { formatDate } from "@/lib/format";
import { OUTLIERS_PLAIN, VS_NORMAL } from "@/lib/plain-language-results";

/** Tutan içerikler tablo görünümü (geniş ekran; dar ekranda sonuç alanı kartları gösterir). */
export function OutlierTable({
  items,
  timeZone,
  membership = {},
  adMarks,
}: {
  items: ContentItem[];
  timeZone?: string;
  /** İçerik kimliği → üye olduğu koleksiyon kimlikleri ("Kaydet" düğmelerinin ilk durumu). */
  membership?: Record<string, string[]>;
  /** İçerik kimliği → reklam işareti (yalnız yönetici modunda). */
  adMarks?: OrganicAdMarks;
}) {
  const { columns } = OUTLIERS_PLAIN;
  return (
    <ScrollTable label="Tutan içerikler tablosu">
      <TableHeader>
        <TableRow>
          <TableHead>{columns.content}</TableHead>
          <TableHead>{columns.account}</TableHead>
          <TableHead className="text-right">{columns.views}</TableHead>
          <TableHead>{VS_NORMAL.column}</TableHead>
          <TableHead className="text-right">
            <ViewsPerFollowerLabel />
          </TableHead>
          <TableHead>{columns.published}</TableHead>
          <TableHead>
            <span className="sr-only">{columns.save}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} data-content-id={item.id}>
            <TableCell className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <CoverPlaceholder format={item.format} className="size-10 shrink-0 rounded-md" />
                <div className="grid min-w-0 gap-1">
                  <ContentLink id={item.id} externalUrl={item.url}>
                    {captionPreview(item.caption, 80) ?? OUTLIERS_PLAIN.noCaption}
                  </ContentLink>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <FormatBadge format={item.format} className="w-fit" />
                    {adMarks?.[item.id] !== undefined ? <AdOrganicBadge mark={adMarks[item.id]} /> : null}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">@{item.owner.handle}</div>
                  <div className="text-xs text-muted-foreground">
                    <OwnerFollowers followers={item.owner.followers} />
                  </div>
                </div>
                <PlatformBadge platform={item.platform} />
              </div>
            </TableCell>
            <TableCell className="text-right">
              <ViewsValue item={item} />
            </TableCell>
            <TableCell>
              <LiftBadge {...item.score} />
            </TableCell>
            <TableCell className="text-right">
              <ViewsPerFollowerValue item={item} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(item.publishedAt, timeZone) ?? "—"}
            </TableCell>
            <TableCell>
              <SaveToCollectionButton contentId={item.id} initialCollectionIds={membership[item.id]} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </ScrollTable>
  );
}
