import { Lightbulb, RefreshCw, TrendingUp, type LucideIcon } from "lucide-react";

import { BriefingActionView } from "@/components/briefing/briefing-action";
import { EvidenceLinks, resolveEvidence } from "@/components/briefing/evidence-links";
import { splitLeadSentence } from "@/components/briefing/lead-sentence";
import { AiSurface, AiVoice } from "@/components/common/ai-surface";
import { WhyDisclosure } from "@/components/common/why-disclosure";
import { BRIEFING_ITEM_KIND_LABEL, type BriefingItem, type BriefingItemKind } from "@/lib/domain/briefing";
import { cn } from "@/lib/utils";
import type { WorkspaceCommandRef } from "@/lib/workspace/command";

/** Notlarda gösterilen türler: `next_step` ve `pending` Özet'in "senden beklediğim" satırı ve plan kartıyla karşılanır. */
export const NOTE_KINDS: readonly BriefingItemKind[] = ["changed", "worked", "opportunity"];

const KIND_ICON: Partial<Record<BriefingItemKind, LucideIcon>> = {
  changed: RefreshCw,
  worked: TrendingUp,
  opportunity: Lightbulb,
};

/**
 * Tek not (satır; kutu değil): tür etiketi, başlık, TEK cümle, künye (güven ölçeği + kanıt sayısı). Gövdenin kalanı, kanıt çipleri ve
 * eylem "Neden?" içindedir (yerel `<details>`: JS yok). Gövde DB'den hazır gelir (sayılar yerleştirilmiş, olduğu gibi basılır).
 */
export function BriefingNote({
  item,
  workspace,
  operator = false,
  className,
}: {
  item: BriefingItem;
  workspace: WorkspaceCommandRef;
  operator?: boolean;
  className?: string;
}) {
  const Icon = KIND_ICON[item.kind];
  const { lead, rest } = splitLeadSentence(item.body);
  return (
    <li className={cn("min-w-0 py-4 first:pt-0 last:pb-0", className)} data-kind={item.kind}>
      <AiSurface
        confidence={item.confidence}
        evidenceCount={resolveEvidence(item.evidence).length}
        footer={
          <WhyDisclosure>
            {rest !== "" ? <AiVoice className="text-base text-muted-foreground">{rest}</AiVoice> : null}
            <EvidenceLinks evidence={item.evidence} />
            {item.action ? <BriefingActionView action={item.action} workspace={workspace} operator={operator} /> : null}
          </WhyDisclosure>
        }
      >
        <div className="flex items-center gap-1.5 text-xs text-ai-meta">
          {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
          <span>{BRIEFING_ITEM_KIND_LABEL[item.kind]}</span>
        </div>
        <h3 className="font-heading text-[0.9375rem] leading-snug font-semibold break-words">{item.headline}</h3>
        {lead !== "" ? <AiVoice>{lead}</AiVoice> : null}
      </AiSurface>
    </li>
  );
}
