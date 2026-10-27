import { ChevronRight } from "lucide-react";

import { CopyButton } from "@/components/ideas/copy-button";
import { TAP } from "@/components/weekly-plan/tap-target";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Fikir kartındaki uzun taslak metin (açıklama): açılır/kapanır (yerel `<details>`), kopyalama düğmeli. Senaryo `ScriptSection`'dadır.
 * Metin yoksa hiçbir şey çizilmez (eski/elle eklenen fikirde `details` boştur).
 */
export function DraftText({
  title,
  text,
  language,
  copyLabel,
}: {
  title: string;
  text?: string;
  /** İçerik dili (ISO kodu), biliniyorsa rozet. */
  language?: string;
  copyLabel: string;
}) {
  const body = text?.trim();
  if (!body) return null;

  return (
    <details className="group text-sm">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase select-none hover:text-foreground [&::-webkit-details-marker]:hidden",
          TAP,
        )}
      >
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
        {title}
        {language ? (
          <Badge variant="outline" className="ml-1 normal-case">
            {language.toUpperCase()}
          </Badge>
        ) : null}
      </summary>
      <div className="mt-2 flex items-start justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
        <p className="whitespace-pre-line">{body}</p>
        <CopyButton text={body} label={copyLabel} />
      </div>
    </details>
  );
}
