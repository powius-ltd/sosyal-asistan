import { CursorPager } from "@/components/common/cursor-pager";
import { previousPage } from "@/components/common/cursor-trail";
import { buildHookHref, buildHookPageHref, type HookUiState } from "@/components/hooks/search-params";
import { formatNumber } from "@/lib/format";
import { OPENINGS_PLAIN } from "@/lib/plain-language-results";

interface HookPaginationProps {
  state: HookUiState;
  /** Bu sayfadaki giriş sayısı. */
  shown: number;
  /** Filtreye uyan toplam. */
  total?: number;
  nextCursor?: string;
}

/** İleri yönlü (imleçli) sayfalama: "İlk sayfa" (üçüncü sayfadan itibaren), "Önceki sayfa" ve "Sonraki sayfa"; süzgeçler korunur. */
export function HookPagination({ state, shown, total, nextCursor }: HookPaginationProps) {
  const hasPrevious = state.cursor !== undefined;
  if (!hasPrevious && !nextCursor) return null;
  const previous = previousPage(state);
  return (
    <CursorPager
      summary={OPENINGS_PLAIN.total(formatNumber(total), formatNumber(shown) ?? "0")}
      previousHref={previous ? buildHookPageHref(state, previous) : undefined}
      firstHref={state.trail.length > 0 ? buildHookHref(state) : undefined}
      nextHref={nextCursor ? buildHookHref(state, nextCursor) : undefined}
    />
  );
}
