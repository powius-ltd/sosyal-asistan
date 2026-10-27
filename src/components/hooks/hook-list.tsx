import { ContentLink } from "@/components/common/content-link";
import { LiftBadge } from "@/components/common/lift-badge";
import { MeasuredValue } from "@/components/common/measured-value";
import { AdOrganicBadge } from "@/components/outliers/ad-organic-badge";
import { HookSourceBadge } from "@/components/hooks/hook-source-badge";
import { CopyButton } from "@/components/ideas/copy-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { HookLibraryEntry } from "@/lib/domain/hook-library";
import type { OrganicAdMarks } from "@/lib/matrix/ad-organic";
import { formatDate } from "@/lib/format";
import { openingTypeLabel, OPENINGS_PLAIN } from "@/lib/plain-language-results";

/**
 * Açılış kütüphanesi listesi: açılış cümlesi (birebir alıntı), kaynak rozeti (konuşma / ekran yazısı / açıklama), tarz (yeni
 * taksonomi tarzları dahil), tarzı doğrulayan alıntı, hesap, kendi/rakip, normaline göre sonuç, tarih, video bağlantısı, kopyala.
 * `adMarks` (yalnız yönetici modunda): kendi açılışın reklamda kullanıldıysa durumu. `hookSource` eski analizde kaydedilmemişse yoktur ve rozet çizilmez — liste satırında "kaynak —" tire yığını anlam katmaz.
 */
export function HookList({ entries, timeZone, adMarks }: { entries: HookLibraryEntry[]; timeZone?: string; adMarks?: OrganicAdMarks }) {
  return (
    <Card size="sm" className="gap-0 py-0">
      <ul className="divide-y">
        {entries.map((entry) => (
          <li key={entry.contentId} className="flex items-start gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-sm font-medium">“{entry.hookText}”</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary">{openingTypeLabel(entry.hookType)}</Badge>
                {entry.hookSource ? <HookSourceBadge source={entry.hookSource} /> : null}
                <span>@{entry.ownerHandle}</span>
                <Badge variant="outline">{entry.isOwn ? OPENINGS_PLAIN.own : OPENINGS_PLAIN.rival}</Badge>
                {entry.isOwn && adMarks?.[entry.contentId] !== undefined ? <AdOrganicBadge mark={adMarks[entry.contentId]} /> : null}
                <LiftBadge lift={entry.lift} liftTier={entry.liftTier} />
                <MeasuredValue value={formatDate(entry.publishedAt, timeZone)} reason={OPENINGS_PLAIN.unknownDate} />
                <ContentLink id={entry.contentId} className="max-md:min-h-tap max-md:items-center">Video analizi</ContentLink>
              </div>
              {entry.hookTypeEvidence ? (
                <p className="text-xs text-muted-foreground">
                  {OPENINGS_PLAIN.evidence}: <span className="italic">“{entry.hookTypeEvidence}”</span>
                </p>
              ) : null}
            </div>
            <CopyButton text={entry.hookText} label={OPENINGS_PLAIN.copy} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
