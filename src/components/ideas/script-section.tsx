import { ChevronRight } from "lucide-react";

import { CopyButton } from "@/components/ideas/copy-button";
import { TAP } from "@/components/weekly-plan/tap-target";
import { Badge } from "@/components/ui/badge";
import { IDEA_PLAIN } from "@/lib/plain-language-plan";
import { cn } from "@/lib/utils";

/** Karşılaştırma için boşluk ve satır sonları tek boşluğa indirilir. */
const flatten = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * Senaryo, TEK yerde (D2-12): çekim adımları (`scriptOutline`) ve varsa söylenecek metin (`details.script`). İkisi aynı sözleri taşıyorsa
 * yalnız adımlar çizilir (aynı metin iki kez yazılmaz); farklıysa ikisi etiketli iki parça olarak aynı bölümde durur. Metin satır
 * sonlarını korur (`whitespace-pre-line`). `open`: `?id=` ile gelinen kartta bölüm açık gelir (D2-02).
 */
export function ScriptSection({ steps, script, language, open }: { steps: string[]; script?: string; language?: string; open?: boolean }) {
  const spoken = script?.trim() ? script.trim() : undefined;
  const sameWords = spoken !== undefined && flatten(spoken) === flatten(steps.join(" "));
  const showSpoken = spoken !== undefined && !sameWords;
  const copyText = showSpoken ? spoken : steps.length > 0 ? steps.join("\n") : undefined;

  return (
    <details className="group text-sm" open={open}>
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase select-none hover:text-foreground [&::-webkit-details-marker]:hidden",
          TAP,
        )}
      >
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
        {IDEA_PLAIN.scriptTitle}
        {steps.length > 0 ? ` (${steps.length} adım)` : ""}
        {language ? (
          <Badge variant="outline" className="ml-1 normal-case">
            {language.toUpperCase()}
          </Badge>
        ) : null}
      </summary>
      {steps.length === 0 && !showSpoken ? (
        <p className="mt-2 text-muted-foreground">{IDEA_PLAIN.scriptEmpty}</p>
      ) : (
        <div className="mt-2 flex items-start justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <div className="flex min-w-0 flex-col gap-3">
            {steps.length > 0 ? (
              <div className="flex flex-col gap-1">
                {showSpoken ? <h4 className="text-xs font-medium text-muted-foreground">{IDEA_PLAIN.scriptSteps}</h4> : null}
                <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-muted-foreground">
                  {steps.map((step, index) => (
                    <li key={index} className="whitespace-pre-line">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {showSpoken ? (
              <div className="flex flex-col gap-1">
                <h4 className="text-xs font-medium text-muted-foreground">{IDEA_PLAIN.scriptSpoken}</h4>
                <p className="whitespace-pre-line">{spoken}</p>
              </div>
            ) : null}
          </div>
          {copyText ? <CopyButton text={copyText} label={IDEA_PLAIN.scriptCopy} /> : null}
        </div>
      )}
    </details>
  );
}
