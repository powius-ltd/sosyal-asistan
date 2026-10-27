import { TrendingUp, type LucideIcon } from "lucide-react";

import { STATUS_STYLE } from "@/components/matrix/cell-style";
import type { TopicCellStatus } from "@/lib/domain/topic-hook-matrix";

/**
 * Konu × hook hücre görünümü durumdan gelir (açı matrisinin `STATUS_STYLE`'ı ile ortak ton): kanıtlı fırsat vurgulu, kendi tutanı ayrı bir vurgu
 * (`worked`), boş soluk. Renk tek taşıyıcı değildir: her durumun ikonu ve düz dil metni (`TOPIC_STATUS_SHORT`, `lib/matrix/plain.ts`) kutuda yazılıdır.
 */
export const TOPIC_STATUS_STYLE: Record<TopicCellStatus, { icon: LucideIcon; cell: string }> = {
  proven_opportunity: STATUS_STYLE.proven_opportunity,
  worked: {
    icon: TrendingUp,
    cell: "border-primary/60 bg-primary/5 shadow-sm",
  },
  tried: STATUS_STYLE.tried,
  weak: STATUS_STYLE.weak,
  unmeasured: STATUS_STYLE.unmeasured,
  empty: STATUS_STYLE.empty,
};
