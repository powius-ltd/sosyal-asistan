import { Badge } from "@/components/ui/badge";
import type { PublishStatus } from "@/lib/domain/publish";
import { cn } from "@/lib/utils";

/** 10 yayın durumunun Türkçe etiketi. */
export const PUBLISH_STATUS_LABEL: Record<PublishStatus, string> = {
  draft: "Taslak",
  awaiting_approval: "Onay bekliyor",
  approved: "Onaylandı",
  container_pending: "Hazırlanıyor",
  ready: "Yayına hazır",
  publishing: "Yayınlanıyor",
  published: "Yayınlandı",
  failed: "Başarısız",
  expired: "Süresi doldu",
  cancelled: "İptal edildi",
};

/** Durum renkleri (açık/koyu tema). Rozet ve takvim çipi aynı paleti kullanır. */
export const PUBLISH_STATUS_STYLE: Record<PublishStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  awaiting_approval: "bg-warning-soft text-warning-soft-foreground",
  approved: "bg-info-soft text-info-soft-foreground",
  container_pending: "bg-preparing-soft text-preparing-soft-foreground",
  ready: "bg-ready-soft text-ready-soft-foreground",
  publishing: "bg-publishing-soft text-publishing-soft-foreground",
  published: "bg-success-soft text-success-soft-foreground",
  failed: "bg-danger-soft text-danger-soft-foreground",
  expired: "bg-expired-soft text-expired-soft-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
};

/** Yayın durumu rozeti (Türkçe etiket + renk). */
export function PublishStatusBadge({ status, className }: { status: PublishStatus; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", PUBLISH_STATUS_STYLE[status], className)}
      data-status={status}
    >
      {PUBLISH_STATUS_LABEL[status]}
    </Badge>
  );
}
