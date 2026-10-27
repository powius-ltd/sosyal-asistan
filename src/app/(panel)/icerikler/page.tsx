import { Clapperboard, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ContentFilters } from "@/components/content/content-filters";
import { ContentPagination } from "@/components/content/content-pagination";
import { clearedFilters, contentHref, hasActiveFilters } from "@/components/content/content-query";
import { ContentCards } from "@/components/content/content-cards";
import { ContentTable } from "@/components/content/content-table";
import { parseContentQuery, toChartFilter, toContentFilter } from "@/components/content/parse-content-query";
import { PublishedViewsCard } from "@/components/content/published-views-card";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { linkButtonClass } from "@/components/content/link-button";
import { getPanelContext } from "@/lib/data";
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { formatNumber } from "@/lib/format";
import { CONTENT_PLAIN } from "@/lib/plain-language-publish";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "İçeriklerim" };

export default async function ContentPage({ searchParams }: PageProps<"/icerikler">) {
  const raw = await searchParams;
  const { repo, wsId, now } = await getPanelContext();
  const [accounts, workspace] = await Promise.all([repo.listOwnAccounts(wsId), repo.getWorkspace(wsId)]);

  const query = parseContentQuery(
    raw,
    accounts.map((account) => account.id),
  );
  const [{ items, total, nextCursor }, chartPage] = await Promise.all([
    repo.listContent(wsId, toContentFilter(query, now)),
    // Grafik listeyle aynı filtreyi okur ama sayfalamasızdır (tüm filtre, yalnız bu sayfa değil).
    repo.listContent(wsId, toChartFilter(query, now)),
  ]);
  const filtered = hasActiveFilters(query);

  return (
    <>
      <PageHeader
        title="İçeriklerim"
        description={CONTENT_PLAIN.pageDescription}
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon={Settings}
          title="Bağlı hesap yok"
          description="İçerikleri görmek için ayarlardan bir kendi hesap bağla."
          action={
            <Link href={ROUTES.settings} className={linkButtonClass("outline")}>
              Ayarlara git
            </Link>
          }
        />
      ) : (
        <>
          <ContentFilters
            query={query}
            accountOptions={accounts.map((account) => ({
              value: account.id,
              label: `@${account.handle} · ${PLATFORM_LABEL[account.platform]}`,
            }))}
          />

          {items.length === 0 ? (
            <EmptyState
              icon={Clapperboard}
              title={filtered ? "Filtreye uyan içerik yok" : "Henüz içerik yok"}
              description={
                filtered
                  ? "Seçtiğin hesap, format ve tarih aralığında içerik bulunamadı."
                  : "Hesapların senkronize edildiğinde içerikler burada görünür."
              }
              action={
                filtered ? (
                  <Link href={contentHref(clearedFilters(query))} className={linkButtonClass("outline")}>
                    Filtreleri temizle
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <PublishedViewsCard items={chartPage.items} timeZone={workspace?.timezone} />
              <p className="mb-2 text-sm text-muted-foreground">{formatNumber(total ?? items.length)} içerik</p>
              <ContentCards items={items} timeZone={workspace?.timezone} />
              <ContentTable items={items} timeZone={workspace?.timezone} />
              <ContentPagination query={query} shown={items.length} total={total} nextCursor={nextCursor} />
            </>
          )}
        </>
      )}
    </>
  );
}
