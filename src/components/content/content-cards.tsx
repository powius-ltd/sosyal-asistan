import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { contentTitle } from "@/components/content/content-title";
import { FormatBadge } from "@/components/common/format-badge";
import { LiftBadge } from "@/components/common/lift-badge";
import { MeasuredValue } from "@/components/common/measured-value";
import { PlatformBadge } from "@/components/common/platform-badge";
import type { ContentItem } from "@/lib/domain/content";
import { formatDate, formatNumber } from "@/lib/format";
import { liftPhrase } from "@/lib/plain-language";
import { ROUTES } from "@/lib/routes";
import { safeExternalUrl } from "@/lib/safe-url";

/** Kartta ikinci planda gösterilen sayılar; ölçülemeyen tek tek atlanır (0 uydurulmaz, tire de kalabalık yapar). */
const SECONDARY: { key: "likes" | "comments" | "saves"; noun: string }[] = [
  { key: "likes", noun: "beğeni" },
  { key: "comments", noun: "yorum" },
  { key: "saves", noun: "kaydetme" },
];

function ContentCard({ item, timeZone }: { item: ContentItem; timeZone?: string }) {
  const externalUrl = safeExternalUrl(item.url);
  const phrase = liftPhrase(item.score.lift);
  const secondary = SECONDARY.flatMap(({ key, noun }) => {
    const text = formatNumber(item.metrics[key]);
    return text === undefined ? [] : [`${text} ${noun}`];
  });

  return (
    // Kartın tamamı tek hedef: başlık bağlantısının ::after katmanı kartı kaplar; platform bağlantısı onun üstünde kalır.
    <li className="relative flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={ROUTES.video(item.id)}
          className="line-clamp-2 min-h-tap min-w-0 flex-1 content-center font-medium outline-none after:absolute after:inset-0 after:content-['']"
        >
          {contentTitle(item)}
        </Link>
        {externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Platformda aç"
            className="relative z-10 -mt-2 -mr-2 flex min-h-tap min-w-tap shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <PlatformBadge platform={item.platform} />
        <span>@{item.owner.handle}</span>
        <FormatBadge format={item.format} />
        <MeasuredValue value={formatDate(item.publishedAt, timeZone)} reason="Yayın tarihi platformdan alınamadı." />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-semibold tabular">
          <MeasuredValue value={item.metrics.views} reason="Platform bu içerik için izlenme sayısını vermedi ya da henüz ölçülmedi." />
        </span>
        <span className="text-sm text-muted-foreground">izlenme</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <LiftBadge {...item.score} />
        {phrase ? <span className="text-muted-foreground">{phrase}</span> : null}
      </div>

      {secondary.length > 0 ? <p className="text-xs text-muted-foreground">{secondary.join(" · ")}</p> : null}
    </li>
  );
}

/** Dar ekranda içerik listesi: her içerik bir kart (başlık, izlenme, normalinin kaç katı); tablo geniş ekrandadır. */
export function ContentCards({ items, timeZone }: { items: ContentItem[]; timeZone?: string }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden" aria-label="İçerikler">
      {items.map((item) => (
        <ContentCard key={item.id} item={item} timeZone={timeZone} />
      ))}
    </ul>
  );
}
