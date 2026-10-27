import { ItemNote } from "@/components/collections/item-note";
import { RemoveItemButton } from "@/components/collections/remove-item-button";
import { ContentLink } from "@/components/common/content-link";
import { FormatBadge } from "@/components/common/format-badge";
import { LiftBadge } from "@/components/common/lift-badge";
import { PlatformBadge } from "@/components/common/platform-badge";
import type { CollectionItemView } from "@/lib/domain/collection";
import { formatDate } from "@/lib/format";
import { truncateText } from "@/lib/text";

const CAPTION_PREVIEW_CHARS = 120;

/** Koleksiyondaki içerikler (yeniden eskiye): kısaltılmış alt yazı → Video analizi, hesap/platform/biçim/lift, not, çıkar. */
export function CollectionItems({ items, timeZone }: { items: CollectionItemView[]; timeZone?: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const { content } = item;
        const title = content.caption ? truncateText(content.caption, CAPTION_PREVIEW_CHARS) : "Alt yazı yok";
        return (
          <li key={item.contentId} className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-3 text-card-foreground">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <ContentLink id={item.contentId} externalUrl={content.url}>
                  {title}
                </ContentLink>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">@{content.ownerHandle}</span>
                  <PlatformBadge platform={content.platform} />
                  <FormatBadge format={content.format} />
                  <LiftBadge lift={content.currentLift} />
                  <span>{formatDate(item.addedAt, timeZone) ?? "—"} tarihinde eklendi</span>
                </div>
              </div>
              <RemoveItemButton collectionId={item.collectionId} contentId={item.contentId} label={title} />
            </div>
            <ItemNote collectionId={item.collectionId} contentId={item.contentId} note={item.note} />
          </li>
        );
      })}
    </ul>
  );
}
