import { ExternalLink, Pin, ScanSearch } from "lucide-react";
import Link from "next/link";

import { FormatBadge } from "@/components/common/format-badge";
import { MeasuredValue } from "@/components/common/measured-value";
import { PlatformBadge } from "@/components/common/platform-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ContentItem } from "@/lib/domain/content";
import { formatCompact, formatDateTime, formatDuration } from "@/lib/format";
import { anatomyFor } from "@/lib/routes";
import { safeExternalUrl } from "@/lib/safe-url";

/** Video analizinin üst kartı: hesap, platform, biçim, yayın tarihi (workspace saat diliminde), orijinal gönderi bağlantısı, alt yazı. */
export function VideoSummary({ item, timeZone }: { item: ContentItem; timeZone?: string }) {
  const url = safeExternalUrl(item.url);
  const isOwn = item.owner.kind === "own";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-medium">@{item.owner.handle}</span>
            {item.owner.displayName ? (
              <span className="text-muted-foreground">{item.owner.displayName}</span>
            ) : null}
            <Badge variant={isOwn ? "default" : "secondary"}>{isOwn ? "Kendi hesap" : "Rakip"}</Badge>
            <PlatformBadge platform={item.platform} />
            <FormatBadge format={item.format} />
            {item.isPinned ? (
              <Badge variant="outline" className="gap-1">
                <Pin aria-hidden />
                Sabitlenmiş
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={anatomyFor(item.id)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ScanSearch aria-hidden />
              Anatomisini gör
            </Link>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ExternalLink aria-hidden />
                Orijinal gönderiyi aç
              </a>
            ) : null}
          </div>
        </div>

        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <div className="flex gap-1.5">
            <dt>Yayın tarihi:</dt>
            <dd className="text-foreground">
              <MeasuredValue value={formatDateTime(item.publishedAt, timeZone)} reason="Platform yayın tarihini vermedi." />
            </dd>
          </div>
          {item.format === "short_video" || item.format === "long_video" ? (
            <div className="flex gap-1.5">
              <dt>Süre:</dt>
              <dd className="text-foreground">
                <MeasuredValue value={formatDuration(item.durationSec)} reason="Video süresi alınamadı." />
              </dd>
            </div>
          ) : null}
          <div className="flex gap-1.5">
            <dt>Takipçi:</dt>
            <dd className="text-foreground">
              <MeasuredValue
                value={formatCompact(item.owner.followers)}
                reason="Hesabın takipçi sayısı alınamadı."
              />
            </dd>
          </div>
        </dl>

        {item.caption ? (
          <p className="text-sm whitespace-pre-line">{item.caption}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Bu gönderide alt yazı yok.</p>
        )}
      </CardContent>
    </Card>
  );
}
