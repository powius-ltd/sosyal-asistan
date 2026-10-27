import { ImageIcon } from "lucide-react";

import { contentTitle } from "@/components/content/content-title";
import { ContentLink } from "@/components/common/content-link";
import { FormatBadge } from "@/components/common/format-badge";
import { LiftBadge } from "@/components/common/lift-badge";
import { MeasuredValue } from "@/components/common/measured-value";
import { PlatformBadge } from "@/components/common/platform-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ContentItem } from "@/lib/domain/content";
import { fromNumber, noneMeasured } from "@/lib/domain/measured";
import { formatDate } from "@/lib/format";
import { CONTENT_PLAIN } from "@/lib/plain-language-publish";

type MetricKey = "views" | "likes" | "comments" | "saves";

const METRIC_COLUMNS: { key: MetricKey; label: string; noun: string }[] = [
  { key: "views", label: "İzlenme", noun: "izlenme" },
  { key: "likes", label: "Beğeni", noun: "beğeni" },
  { key: "comments", label: "Yorum", noun: "yorum" },
  { key: "saves", label: "Kaydetme", noun: "kaydetme" },
];

/** Ölçülemeyen metriğin sebebi: normalize sırasında platform vermediyse söylenir, yoksa henüz ölçülmemiştir. */
function metricReason(item: ContentItem, key: MetricKey, noun: string): string {
  return item.missingFields.includes(key)
    ? `Platform bu içerik için ${noun} sayısını vermedi.`
    : `Bu içeriğin ${noun} sayısı henüz ölçülmedi.`;
}

interface ContentTableProps {
  items: ContentItem[];
  /** Workspace saat dilimi (IANA). */
  timeZone?: string;
}

/**
 * Kendi hesap içerikleri tablosu (geniş ekran; dar ekranda `ContentCards` çizilir). Bir sayfada tamamı ölçülemeyen metrik sütunu gizlenir
 * ("12 tane tire göstermekten dürüst", bkz. domain/measured.ts) ve altta belirtilir.
 */
export function ContentTable({ items, timeZone }: ContentTableProps) {
  const visible = METRIC_COLUMNS.filter(
    (column) => !noneMeasured(items.map((item) => fromNumber(item.metrics[column.key]))),
  );
  const hidden = METRIC_COLUMNS.filter((column) => !visible.includes(column));

  return (
    <div className="hidden md:block">
      <div className="rounded-xl bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">
                <span className="sr-only">Görsel</span>
              </TableHead>
              <TableHead>İçerik</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Yayın tarihi</TableHead>
              {visible.map((column) => (
                <TableHead key={column.key} className="text-right">
                  {column.label}
                </TableHead>
              ))}
              <TableHead>{CONTENT_PLAIN.multiplierColumn}</TableHead>
              <TableHead className="text-right">{CONTENT_PLAIN.comparedColumn}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  {/* Küçük görsel yer tutucu: ContentItem henüz kapak görseli taşımıyor. */}
                  <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <ImageIcon className="size-4" aria-hidden />
                  </div>
                </TableCell>
                <TableCell className="max-w-72 whitespace-normal">
                  <div className="flex flex-col gap-1">
                    <ContentLink id={item.id} externalUrl={item.url}>
                      {contentTitle(item)}
                    </ContentLink>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <PlatformBadge platform={item.platform} />@{item.owner.handle}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <FormatBadge format={item.format} />
                </TableCell>
                <TableCell className="tabular text-muted-foreground">
                  <MeasuredValue
                    value={formatDate(item.publishedAt, timeZone)}
                    reason="Yayın tarihi platformdan alınamadı."
                  />
                </TableCell>
                {visible.map((column) => (
                  <TableCell key={column.key} className="text-right">
                    <MeasuredValue
                      value={item.metrics[column.key]}
                      reason={metricReason(item, column.key, column.noun)}
                    />
                  </TableCell>
                ))}
                <TableCell>
                  <LiftBadge {...item.score} />
                </TableCell>
                <TableCell className="text-right">
                  <MeasuredValue
                    value={item.score.baselineN}
                    reason={CONTENT_PLAIN.comparedReason}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hidden.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Bu sayfadaki hiçbir içerikte ölçülemediği için gizlenen sütunlar: {hidden.map((c) => c.label).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
