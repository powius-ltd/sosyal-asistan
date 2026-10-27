import { Ban, Circle, CircleCheck, CircleHelp, Sparkles, Star, TrendingDown, type LucideIcon } from "lucide-react";

import type { CellStatus, PriorFit } from "@/lib/domain/creative-matrix";

/**
 * Hücre görünümü durumdan gelir: fırsat vurgulu (zeminli + gölge), boş soluk (kesikli çerçeve, düşük opaklık). Renk TEK taşıyıcı değildir:
 * her durumun ikonu ve düz dil metni (`CELL_STATUS_SHORT`, `lib/matrix/plain.ts`) kutuda her zaman yazılıdır.
 */
export const STATUS_STYLE: Record<CellStatus, { icon: LucideIcon; cell: string }> = {
  proven_opportunity: {
    icon: Sparkles,
    cell: "border-cell-opportunity-border bg-cell-opportunity text-cell-opportunity-foreground shadow-sm",
  },
  tried: { icon: CircleCheck, cell: "border-cell-tried-border bg-cell-tried" },
  weak: { icon: TrendingDown, cell: "border-cell-weak-border bg-cell-weak" },
  unmeasured: { icon: CircleHelp, cell: "border-dashed bg-muted/50" },
  empty: { icon: Circle, cell: "border-dashed bg-transparent text-muted-foreground opacity-60" },
};

/** Beklenen uyum işareti: iyi dolu yıldız, orta boş yıldız, zayıf yasak simgesi. */
export const PRIOR_ICON: Record<PriorFit, { icon: LucideIcon; filled: boolean }> = {
  birincil: { icon: Star, filled: true },
  ikincil: { icon: Star, filled: false },
  aykiri: { icon: Ban, filled: false },
};
