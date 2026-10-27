import { Flame } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { OutlierCard } from "@/components/outliers/outlier-card";
import { OutlierPagination } from "@/components/outliers/outlier-pagination";
import { OutlierTable } from "@/components/outliers/outlier-table";
import { hasActiveFilters, type OutlierUiState } from "@/components/outliers/search-params";
import { buttonVariants } from "@/components/ui/button";
import type { PagedResult } from "@/lib/data/queries";
import type { ContentItem } from "@/lib/domain/content";
import type { OrganicAdMarks } from "@/lib/matrix/ad-organic";
import { OUTLIERS_PLAIN } from "@/lib/plain-language-results";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

interface OutlierResultsProps {
  state: OutlierUiState;
  page: PagedResult<ContentItem>;
  timeZone?: string;
  /** İçerik kimliği → üye olduğu koleksiyon kimlikleri (sayfanın tek toplu okuması; "Kaydet" düğmelerinin ilk durumu). */
  membership?: Record<string, string[]>;
  /** İçerik kimliği → reklam işareti (yalnız yönetici modunda; reklam hesabı yoksa verilmez). */
  adMarks?: OrganicAdMarks;
}

/** Sonuç alanı: boş durum ya da kart/tablo görünümü (tablo yalnız geniş ekranda) + sayfalama. */
export function OutlierResults({ state, page, timeZone, membership = {}, adMarks }: OutlierResultsProps) {
  if (page.items.length === 0) {
    const filtered = hasActiveFilters(state);
    const { empty, filteredEmpty } = OUTLIERS_PLAIN;
    return (
      <EmptyState
        icon={Flame}
        title={filtered ? filteredEmpty.title : empty.title}
        description={filtered ? filteredEmpty.body : empty.body}
        action={
          <Link
            href={filtered ? ROUTES.outliers : ROUTES.competitors}
            className={cn(buttonVariants({ variant: "outline" }), "max-md:min-h-tap")}
          >
            {filtered ? OUTLIERS_PLAIN.clearFilters : OUTLIERS_PLAIN.goCompetitors}
          </Link>
        }
      />
    );
  }

  const cards = (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {page.items.map((item) => (
        <OutlierCard key={item.id} item={item} timeZone={timeZone} initialCollectionIds={membership[item.id]} adMark={adMarks?.[item.id]} />
      ))}
    </div>
  );

  return (
    <>
      {state.view === "table" ? (
        <>
          {/* Tablo yalnız geniş ekranda; dar ekranda aynı sonuçlar kart olarak (tablo yana kayıp asıl veriyi saklıyordu). */}
          <div className="hidden md:block">
            <OutlierTable items={page.items} timeZone={timeZone} membership={membership} adMarks={adMarks} />
          </div>
          <div className="md:hidden">{cards}</div>
        </>
      ) : (
        cards
      )}
      <OutlierPagination state={state} shown={page.items.length} total={page.total} nextCursor={page.nextCursor} />
    </>
  );
}
