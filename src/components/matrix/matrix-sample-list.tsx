import { ContentLink } from "@/components/common/content-link";
import { LiftBadge } from "@/components/common/lift-badge";
import { PlatformBadge } from "@/components/common/platform-badge";
import { Badge } from "@/components/ui/badge";
import { CELL_SAMPLES_MAX, type CreativeMatrixSample } from "@/lib/domain/creative-matrix";
import { formatNumber } from "@/lib/format";
import { openingTypeLabel } from "@/lib/plain-language-results";
import { truncateText } from "@/lib/text";

const CAPTION_MAX_CHARS = 90;

/**
 * Kutunun örnek videoları (normaline göre; sahip + sonuç + içeriğe bağlantı). Yaklaşım haritası ve konu haritası kutu ayrıntıları ortak kullanır.
 * `total` = hücredeki toplam video (örnek sayısından fazlaysa başlıkta "en çok N" yazılır).
 */
export function MatrixSampleList({ samples, total }: { samples: readonly CreativeMatrixSample[]; total: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-xs font-medium text-muted-foreground">
        Örnek videolar (normaline göre{total > samples.length ? `, ${formatNumber(total)} videodan en çok ${formatNumber(CELL_SAMPLES_MAX)}` : ""})
      </h4>
      <ul className="flex flex-col divide-y rounded-lg border bg-background/80">
        {samples.map((sample) => (
          <li key={sample.contentItemId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="flex min-w-0 flex-col gap-0.5">
              <ContentLink id={sample.contentItemId} externalUrl={sample.url} className="max-md:min-h-tap max-md:items-center">
                {sample.caption !== undefined ? truncateText(sample.caption, CAPTION_MAX_CHARS) : `@${sample.ownerHandle} videosu (alt yazı yok)`}
              </ContentLink>
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>@{sample.ownerHandle}</span>
                <Badge variant={sample.isOwn ? "default" : "secondary"}>{sample.isOwn ? "Kendi" : "Rakip"}</Badge>
                <PlatformBadge platform={sample.platform} />
                {sample.hookType !== undefined ? <span>Açılış: {openingTypeLabel(sample.hookType)}</span> : null}
              </span>
            </span>
            <LiftBadge lift={sample.currentLift} />
          </li>
        ))}
      </ul>
    </div>
  );
}
