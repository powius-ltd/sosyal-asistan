import { Badge } from "@/components/ui/badge";
import type { JobStatus } from "@/lib/domain/panel-job";
import type { JobStatusView } from "@/lib/domain/panel-job-view";
import { JOB_STALE_PLAIN, JOB_STATUS_PLAIN } from "@/lib/plain-language";
import { cn } from "@/lib/utils";

/** Durum → rozet rengi (anlam belirteci). Sırada / durduruldu nötr; durdu ve kısmi uyarı; tamamlanamadı tehlike. */
const TONE: Record<JobStatus, string> = {
  queued: "bg-secondary text-secondary-foreground",
  running: "bg-info-soft text-info-soft-foreground",
  succeeded: "bg-success-soft text-success-soft-foreground",
  partial: "bg-warning-soft text-warning-soft-foreground",
  blocked: "bg-warning-soft text-warning-soft-foreground",
  failed: "bg-danger-soft text-danger-soft-foreground",
  cancelled: "bg-secondary text-secondary-foreground",
};

/** İşin durum rozeti. Çalışıyor görünen ama nabzı kesilen iş "yanıt vermiyor" diye, tehlike rengiyle yazılır. Metin sözlükten. */
export function JobStatusBadge({ view, className }: { view: Pick<JobStatusView, "status" | "stale">; className?: string }) {
  return (
    <Badge
      variant="outline"
      data-status={view.stale ? "stale" : view.status}
      className={cn("border-transparent", view.stale ? TONE.failed : TONE[view.status], className)}
    >
      {view.stale ? JOB_STALE_PLAIN : JOB_STATUS_PLAIN[view.status]}
    </Badge>
  );
}
