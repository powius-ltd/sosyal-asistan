import { TriangleAlert } from "lucide-react";

import { ContentLink } from "@/components/common/content-link";
import { LiftBadge } from "@/components/common/lift-badge";
import { evidenceTitle } from "@/components/ideas/idea-evidence";
import { TAP_LINKS } from "@/components/weekly-plan/tap-target";
import type { IdeaEvidence } from "@/lib/domain/intel";
import { IDEA_PLAIN } from "@/lib/plain-language-plan";

/**
 * Fikrin dayandığı videolar: içerik bağlantısı + fikir hazırlanırken ne kadar tuttuğu (çarpan rozeti). En az 2 video beklenir. Başlık, hesap ve
 * bağlantı kanıtın kendi özetinden gelir (`IdeaEvidence`): kanıt başına içerik okunmaz.
 */
export function EvidenceList({ evidence }: { evidence: IdeaEvidence[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {IDEA_PLAIN.evidenceTitle} <span className="font-normal normal-case">{IDEA_PLAIN.evidenceNote}</span>
      </h3>
      {evidence.length === 0 ? (
        <p className="text-sm text-muted-foreground">{IDEA_PLAIN.noEvidence}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {evidence.map((item) => (
            <li key={item.contentItemId} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <ContentLink id={item.contentItemId} externalUrl={item.url} className={TAP_LINKS}>
                  {evidenceTitle(item)}
                </ContentLink>
                <span className="shrink-0 text-xs text-muted-foreground">@{item.ownerHandle}</span>
              </span>
              <LiftBadge lift={item.liftAtCreation} className="shrink-0" />
            </li>
          ))}
        </ul>
      )}
      {evidence.length === 1 ? (
        <p className="flex items-center gap-1.5 text-xs text-warning-strong">
          <TriangleAlert className="size-3.5" aria-hidden />
          {IDEA_PLAIN.oneEvidence}
        </p>
      ) : null}
    </div>
  );
}
