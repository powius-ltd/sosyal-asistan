import Link from "next/link";

import {
  contentHref,
  CONTENT_PAGE_SIZE,
  nextPageQuery,
  pageNumber,
  prevPageQuery,
  type ContentQuery,
} from "@/components/content/content-query";
import { linkButtonClass } from "@/components/content/link-button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function PageLink({ href, children }: { href?: string; children: string }) {
  const className = cn(linkButtonClass("outline"), "min-h-tap min-w-tap md:min-h-0 md:min-w-0");
  if (!href) {
    return (
      <span aria-disabled="true" className={cn(className, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

interface ContentPaginationProps {
  query: ContentQuery;
  /** Bu sayfadaki kayıt sayısı. */
  shown: number;
  /** Filtreye uyan toplam (biliniyorsa). */
  total?: number;
  nextCursor?: string;
}

/** Önceki/Sonraki bağlantıları. İmleç opak olduğundan geri gitmek için URL'de önceki imleçler taşınır. */
export function ContentPagination({ query, shown, total, nextCursor }: ContentPaginationProps) {
  const prev = prevPageQuery(query);
  if (!prev && !nextCursor) return null;

  const from = (pageNumber(query) - 1) * CONTENT_PAGE_SIZE + 1;
  const range = `${formatNumber(from)}–${formatNumber(from + Math.max(shown, 1) - 1)}`;

  return (
    <nav aria-label="Sayfalama" className="mt-4 flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        {range}
        {total !== undefined ? ` / ${formatNumber(total)}` : ""}
      </p>
      <div className="flex gap-2">
        <PageLink href={prev ? contentHref(prev) : undefined}>Önceki</PageLink>
        <PageLink href={nextCursor ? contentHref(nextPageQuery(query, nextCursor)) : undefined}>Sonraki</PageLink>
      </div>
    </nav>
  );
}
