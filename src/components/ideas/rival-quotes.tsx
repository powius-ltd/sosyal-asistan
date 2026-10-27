import { ContentLink } from "@/components/common/content-link";
import { TAP_LINKS } from "@/components/weekly-plan/tap-target";
import { RIVAL_QUOTE_MAX, type RivalQuote } from "@/lib/domain/intel";
import { cn } from "@/lib/utils";
import { truncateText } from "@/lib/text";

/**
 * Fikre bağlı kısa rakip alıntıları (kalıcı; transcript 90 günde silinse de kalır): alıntı + @sahip + videoya bağlantı.
 * Alıntı en çok `RIVAL_QUOTE_MAX` karakter (üretimde zaten sınırlı; gösterimde de savunma amaçlı kesilir).
 */
export function RivalQuotes({ quotes }: { quotes?: RivalQuote[] }) {
  if (!quotes || quotes.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Rakip alıntıları</h3>
      <ul className="flex flex-col gap-2">
        {quotes.map((quote, index) => (
          <li key={`${quote.contentItemId}:${index}`} className="flex flex-col gap-0.5">
            <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground italic">
              “{truncateText(quote.text, RIVAL_QUOTE_MAX)}”
            </blockquote>
            <span className="flex items-center gap-2 pl-3 text-xs text-muted-foreground">
              {quote.ownerHandle ? <span>@{quote.ownerHandle}</span> : <span>Rakip</span>}
              <ContentLink id={quote.contentItemId} className={cn("text-foreground", TAP_LINKS)}>
                Video analizi
              </ContentLink>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
