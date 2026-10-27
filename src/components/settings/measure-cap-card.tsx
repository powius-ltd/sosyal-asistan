import { ShieldAlert, ShieldCheck } from "lucide-react";

import { MeasureCapForm } from "@/components/settings/measure-cap-form";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { JobCommand } from "@/components/workspace/job-command";
import { formatDateTime, formatUsd } from "@/lib/format";

/**
 * "Ölçüm tavanı" kartı: Reels D+1/3/7 ölçümünün aylık harcama izni. Varsayılan ONAYSIZdır (`measureMonthlyCapUsd` yok): ölçüm
 * harcaması yapılmaz. Tavan kaydedilince onay anı gösterilir; ölçüm işi kalan hakkı bununla sınırlar. Altında ölçümü başlatan iş düğmesi
 * (önce tahmini gösteren onay penceresini açar); işler panelden başlatılamıyorsa yerine komut metni yedek kalır. Kart yalnız yönetici
 * modunda çizilir (sayfa).
 */
export function MeasureCapCard({ capUsd, approvedAt, timeZone }: { capUsd?: number; approvedAt?: string; timeZone: string }) {
  const approved = capUsd !== undefined;
  return (
    <SettingsSection
      title="Ölçüm tavanı"
      description="Yayınlanan Reels'in 1., 3. ve 7. gün ölçümü küçük bir Apify harcaması yapar; her ölçüm önce tahmini tutarı gösterir. Burada aylık üst sınırı onaylarsın."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {approved ? (
            <>
              <Badge variant="outline" className="gap-1 border-transparent bg-success-soft text-success-soft-foreground">
                <ShieldCheck aria-hidden />
                Onaylı
              </Badge>
              <span>
                Aylık tavan <strong className="tabular">{formatUsd(capUsd) ?? "—"}</strong>
                {capUsd === 0 ? " (ölçüm kapalı)" : ""} · onay: {formatDateTime(approvedAt, timeZone) ?? "zamanı kayıtlı değil"}
              </span>
            </>
          ) : (
            <>
              <Badge variant="outline" className="gap-1 border-transparent bg-warning-soft text-warning-soft-foreground">
                <ShieldAlert aria-hidden />
                Onaysız
              </Badge>
              <span>Onaysız: ölçüm harcaması yapılmaz.</span>
            </>
          )}
        </div>
        <MeasureCapForm initialCapUsd={capUsd} />
        <div className="border-t pt-4">
          <JobCommand request={{ kind: "measure" }} lead="Ölçüm için terminalde:" />
        </div>
      </div>
    </SettingsSection>
  );
}
