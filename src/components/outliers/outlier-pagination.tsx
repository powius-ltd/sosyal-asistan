import { CursorPager } from "@/components/common/cursor-pager";
import { previousPage } from "@/components/common/cursor-trail";
import { buildOutlierHref, buildOutlierPageHref, type OutlierUiState } from "@/components/outliers/search-params";
import { formatNumber } from "@/lib/format";

interface OutlierPaginationProps {
  state: OutlierUiState;
  shown: number;
  total?: number;
  nextCursor?: string;
}

/** İleri yönlü (cursor) sayfalama: "İlk sayfa" (üçüncü sayfadan itibaren), "Önceki sayfa" ve "Sonraki sayfa" bağlantıları. */
export function OutlierPagination({ state, shown, total, nextCursor }: OutlierPaginationProps) {
  const totalText = formatNumber(total);
  const previous = previousPage(state);
  return (
    <CursorPager
      summary={totalText ? `Toplam ${totalText} içerik · bu sayfada ${formatNumber(shown)}` : `Bu sayfada ${formatNumber(shown)} içerik`}
      previousHref={previous ? buildOutlierPageHref(state, previous) : undefined}
      firstHref={state.trail.length > 0 ? buildOutlierHref(state) : undefined}
      nextHref={nextCursor ? buildOutlierHref(state, nextCursor) : undefined}
    />
  );
}
