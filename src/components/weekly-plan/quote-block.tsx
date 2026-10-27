import { ContentLink } from "@/components/common/content-link";
import type { RivalQuote } from "@/lib/domain/intel";
import { TAP_LINKS } from "@/components/weekly-plan/tap-target";
import { cn } from "@/lib/utils";

/** Kısa rakip alıntısı (kalıcı, ≤ 200 karakter): metin + sahibi (`@handle`) ve videonun analizine bağlantı. */
export function QuoteBlock({ quote, className }: { quote: RivalQuote; className?: string }) {
  return (
    <blockquote className={cn("border-l-2 border-border pl-3 text-sm", className)}>
      <p className="italic">“{quote.text}”</p>
      <footer className="mt-0.5 text-xs text-muted-foreground">
        <ContentLink id={quote.contentItemId} className={cn("max-w-full", TAP_LINKS)}>
          {quote.ownerHandle ? `@${quote.ownerHandle}` : "Videoyu aç"}
        </ContentLink>
      </footer>
    </blockquote>
  );
}
