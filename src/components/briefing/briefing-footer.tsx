import { briefingAgeLabel } from "@/components/briefing/age-label";
import { JobCommand } from "@/components/workspace/job-command";
import type { Briefing } from "@/lib/domain/briefing";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { WorkspaceCommandRef } from "@/lib/workspace/command";

/**
 * Yönetici altbilgisi: "X önce üretildi · dayandığı veri: N analiz, M etiket, son toplama T" + notları yenileyen iş düğmesi (işler
 * panelden başlatılamıyorsa yerine komut metni yedek kalır). Bilinmeyen değer (üretim zamanı okunamıyor, hiç toplama kaydı yok)
 * tire/açık sözle yazılır; "0" ya da uydurma zaman değil.
 */
export function BriefingFooter({ briefing, workspace, now, timeZone }: { briefing: Briefing; workspace: WorkspaceCommandRef; now: Date; timeZone?: string }) {
  const age = briefingAgeLabel(briefing.generatedAt, now);
  const { analyzedCount, labeledCount, lastCollectedAt } = briefing.basis;
  const collected = lastCollectedAt === undefined ? undefined : formatDateTime(lastCollectedAt, timeZone);
  return (
    <div data-slot="briefing-footer" className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
        <span>{age !== undefined ? `${age} üretildi` : "Üretim zamanı okunamadı"}</span>
        <span aria-hidden>·</span>
        <span>
          dayandığı veri: {formatNumber(analyzedCount) ?? "—"} analiz, {formatNumber(labeledCount) ?? "—"} etiket, son toplama{" "}
          {collected ?? "kaydı yok"}
        </span>
      </p>
      <JobCommand request={{ kind: "briefing" }} workspace={workspace} lead="yenilemek için" />
    </div>
  );
}
