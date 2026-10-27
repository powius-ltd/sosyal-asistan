import { Info, MessageSquareQuote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { linkButtonClass } from "@/components/content/link-button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { HookFilters } from "@/components/hooks/hook-filters";
import { HookList } from "@/components/hooks/hook-list";
import { HookPagination } from "@/components/hooks/hook-pagination";
import { HookTypeStats } from "@/components/hooks/hook-type-stats";
import {
  buildHookHref,
  clearedHookFilters,
  hasActiveHookFilters,
  parseHookParams,
  toHookFilter,
} from "@/components/hooks/search-params";
import { loadAdUsage } from "@/components/outliers/load-ad-usage";
import { JobCommand } from "@/components/workspace/job-command";
import { getPanelContext } from "@/lib/data";
import { adUsageMarks } from "@/lib/matrix/ad-organic";
import type { PagedResult } from "@/lib/data/queries";
import type { HookLibraryEntry } from "@/lib/domain/hook-library";
import type { OrganicAdMarks } from "@/lib/matrix/ad-organic";
import { openingTypeLabel, OPENINGS_PLAIN } from "@/lib/plain-language-results";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** "Reklamda denenmiş" süzgecinde taranan en çok kendi açılış (tek sayfa; sayfalama yok). */
const HOOK_AD_SCAN_MAX = 100;

/** Reklam kullanımı olan girişler; sayfalama kapanır (hepsi tek sayfada). */
function filterUsedInAds(page: PagedResult<HookLibraryEntry>, marks: OrganicAdMarks): PagedResult<HookLibraryEntry> {
  const items = page.items.filter((entry) => marks[entry.contentId] !== undefined);
  return { items, total: items.length };
}

export const metadata: Metadata = { title: OPENINGS_PLAIN.title };

/**
 * Açılış kütüphanesi: içeriklerin açılış cümleleri (konuşma / ekran yazısı / açıklama), tarzları ve normaline göre sonuçları; videodaki
 * metinden birebir alıntı, yalnız kanıtı doğrulanmış analizlerden. Üstte tür istatistikleri, altında aranabilir/süzülebilir
 * liste. Durum URL'dedir. Analiz yokken (video analizi henüz koşmadı) açıklayıcı boş durum ve video analizini başlatan iş düğmesi
 * gösterilir (`JobCommand`: yalnız işler panelden başlatılabiliyorken; müşteri görünümünde ne düğme ne komut).
 */
export default async function HookLibraryPage(props: PageProps<"/tutanlar/hooklar">) {
  const state = parseHookParams(await props.searchParams);
  const { repo, wsId, now } = await getPanelContext();
  const [workspace, listed, stats] = await Promise.all([
    repo.getWorkspace(wsId),
    // "Reklamda denenmiş" açıkken yalnız kendi açılışlar taranır (en çok HOOK_AD_SCAN_MAX); süzgeç aşağıda, reklam kullanımına göre uygulanır.
    repo.listHookLibrary(wsId, state.adsUsed ? { ...toHookFilter({ ...state, cursor: undefined }), own: true, limit: HOOK_AD_SCAN_MAX } : toHookFilter(state)),
    repo.hookTypeStats(wsId),
  ]);

  // Reklam işareti ve süzgeci: yalnız yönetici modunda ve reklam hesabı varken (yoksa `undefined`: ekran öncekiyle aynı).
  const usage = await loadAdUsage(repo, wsId, listed.items.filter((entry) => entry.isOwn).map((entry) => entry.contentId), now);
  const adMarks = usage === undefined ? undefined : adUsageMarks(usage);
  const adsFilter = usage !== undefined;
  const page = state.adsUsed && adMarks !== undefined ? filterUsedInAds(listed, adMarks) : listed;

  const filtered = hasActiveHookFilters(state);
  // Kütüphane tamamen boş (süzgeç yokken hiç giriş yok): filtre çubuğu ve istatistik anlamsız.
  const libraryEmpty = stats.length === 0 && page.items.length === 0 && !filtered;

  return (
    <>
      <PageHeader
        title={OPENINGS_PLAIN.title}
        description={OPENINGS_PLAIN.description}
        back={{ href: ROUTES.outliers, label: "Tutan içerikler" }}
      />
      <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0" aria-hidden />
        {OPENINGS_PLAIN.info}
      </p>

      {libraryEmpty ? (
        <EmptyState
          icon={MessageSquareQuote}
          title={OPENINGS_PLAIN.empty.title}
          description={OPENINGS_PLAIN.empty.body}
          action={<JobCommand request={{ kind: "analyze" }} className="items-center" />}
        />
      ) : (
        <>
          {stats.length > 0 ? <HookTypeStats stats={stats} state={state} /> : null}
          <HookFilters
            state={state}
            adsFilter={adsFilter}
            typeOptions={stats.map((stat) => ({ value: stat.hookType, label: openingTypeLabel(stat.hookType) }))}
          />
          {page.items.length === 0 ? (
            <EmptyState
              icon={MessageSquareQuote}
              title={OPENINGS_PLAIN.filteredEmpty.title}
              description={OPENINGS_PLAIN.filteredEmpty.body}
              action={
                filtered ? (
                  <Link href={buildHookHref(clearedHookFilters(state))} className={cn(linkButtonClass("outline"), "max-md:min-h-tap")}>
                    Filtreleri temizle
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <HookList entries={page.items} timeZone={workspace?.timezone} adMarks={adMarks} />
              <HookPagination state={state} shown={page.items.length} total={page.total} nextCursor={page.nextCursor} />
            </>
          )}
        </>
      )}
    </>
  );
}
