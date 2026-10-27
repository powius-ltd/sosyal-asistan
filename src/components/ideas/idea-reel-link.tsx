import { CheckCheck, Hourglass } from "lucide-react";

import { ContentLink } from "@/components/common/content-link";
import { LiftBadge } from "@/components/common/lift-badge";
import { ReelLinkForm } from "@/components/ideas/reel-link-form";
import { SuggestionButtons, UnlinkButton } from "@/components/ideas/reel-link-buttons";
import { Badge } from "@/components/ui/badge";
import type { Idea } from "@/lib/domain/intel";
import type { IdeaLink } from "@/lib/domain/outcomes";
import { formatDecimal } from "@/lib/format";
import { contentNoun } from "@/lib/platforms/text";

const PUBLISHED_BADGE = "gap-1 border-transparent bg-success-soft text-success-soft-foreground";

/** Önerilen eşleşme: Reels özeti, skor, gerekçeler; karar kullanıcıda (sessiz bağ yok). */
function SuggestionRow({ link, noun }: { link: IdeaLink; noun: string }) {
  const content = link.content;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-dashed px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">Önerilen eşleşme</Badge>
        {content ? (
          <ContentLink id={content.contentItemId} externalUrl={content.url}>
            {content.caption ?? `@${content.ownerHandle}`}
          </ContentLink>
        ) : (
          <span className="text-muted-foreground">{noun} {link.shortcode}</span>
        )}
        {content ? <LiftBadge lift={content.currentLift} /> : null}
        {link.score === undefined ? null : <span className="text-xs text-muted-foreground tabular">Skor {formatDecimal(link.score, 2)}</span>}
      </div>
      {link.reasons.length > 0 ? <p className="text-xs text-muted-foreground">{link.reasons.join(" · ")}</p> : null}
      <SuggestionButtons linkId={link.id} />
    </li>
  );
}

/**
 * Fikir kartının "Reels bağı" bölümü: aktif bağ varsa "Yayınlandı" rozeti + bağı kaldır; yoksa bekleyen öneriler (Onayla/Reddet)
 * ve link formu. Elenmiş fikre Reels bağlanamaz (form çizilmez). Veri `Idea.reelLink` ve `listIdeaLinks({ status: "suggested" })`'tan gelir.
 */
export function IdeaReelLink({ idea, suggestions = [] }: { idea: Idea; suggestions?: readonly IdeaLink[] }) {
  const link = idea.reelLink;
  // İçerik türünün adı fikrin platformundan ("Reels" / "video").
  const noun = contentNoun(idea.platform);

  if (link) {
    const content = link.content;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm" data-reel-link={link.status}>
        {link.status === "confirmed" ? (
          <Badge variant="outline" className={PUBLISHED_BADGE}>
            <CheckCheck aria-hidden />
            Yayınlandı
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <Hourglass aria-hidden />
            İçerik bekleniyor
          </Badge>
        )}
        {content ? (
          <>
            <ContentLink id={content.contentItemId} externalUrl={content.url}>
              {content.caption ?? `@${content.ownerHandle}`}
            </ContentLink>
            <LiftBadge lift={content.currentLift} />
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{noun} {link.shortcode} henüz toplanmadı; bir sonraki toplamada eşleşir.</span>
        )}
        <UnlinkButton ideaId={idea.id} />
      </div>
    );
  }

  if (idea.status === "dismissed") return null;
  return (
    <div className="flex flex-col gap-3">
      {suggestions.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label={`Önerilen ${noun} eşleşmeleri`}>
          {suggestions.slice(0, 3).map((suggestion) => (
            <SuggestionRow key={suggestion.id} link={suggestion} noun={noun} />
          ))}
        </ul>
      ) : null}
      <ReelLinkForm ideaId={idea.id} platform={idea.platform} />
    </div>
  );
}
