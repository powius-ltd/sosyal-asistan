import { Eye } from "lucide-react";

import { Hint } from "@/components/common/hint";
import { MeasuredValue } from "@/components/common/measured-value";
import { formatViewsPerFollower, viewsPerFollower } from "@/components/outliers/views-per-follower";
import type { ContentItem } from "@/lib/domain/content";
import { formatCompact } from "@/lib/format";
import { SHORT_REASON_PLAIN, VIEWS_PER_FOLLOWER_PLAIN } from "@/lib/plain-language-results";

/** İzlenme: platform vermediyse "—" + sebep (0 değil). */
export function ViewsValue({ item }: { item: ContentItem }) {
  return (
    <MeasuredValue
      value={item.metrics.views}
      format={formatCompact}
      reason="Bu içerik türünde izlenme sayısı platformdan alınamadı."
      shortReason={SHORT_REASON_PLAIN.platformGaveNone}
    />
  );
}

export function ViewsWithIcon({ item }: { item: ContentItem }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Eye className="size-3.5 text-muted-foreground" aria-hidden />
      <ViewsValue item={item} />
    </span>
  );
}

/** İzlenme ÷ takipçi (%): takipçi ya da izlenme ölçülemediyse "—" + sebep (0 değil). */
export function ViewsPerFollowerValue({ item }: { item: ContentItem }) {
  return (
    <MeasuredValue
      measured={viewsPerFollower(item.metrics.views, item.owner.followers)}
      format={formatViewsPerFollower}
      shortReason={SHORT_REASON_PLAIN.notComputable}
    />
  );
}

/** Sütun/alan etiketi; çapraz skor formülü ekrana girmez, "Hesabın büyüklüğüne göre" sıralamasının dayanağı yalnız sözle anılır. */
export function ViewsPerFollowerLabel() {
  return (
    <Hint content={VIEWS_PER_FOLLOWER_PLAIN.hint} label={VIEWS_PER_FOLLOWER_PLAIN.ariaLabel}>
      {VIEWS_PER_FOLLOWER_PLAIN.label}
    </Hint>
  );
}

/** "12,3 B takipçi" ya da ölçülemezse "—". */
export function OwnerFollowers({ followers }: { followers: number | undefined }) {
  return (
    <MeasuredValue
      value={followers}
      format={(v) => `${formatCompact(v)} takipçi`}
      reason="Hesabın takipçi sayısı ölçülemedi."
      shortReason={SHORT_REASON_PLAIN.unknown}
    />
  );
}
