import { FormatBadge } from "@/components/common/format-badge";
import { PlatformBadge } from "@/components/common/platform-badge";
import { DraftText } from "@/components/ideas/draft-text";
import { EvidenceList } from "@/components/ideas/evidence-list";
import { HookOptions } from "@/components/ideas/hook-options";
import { ideaHookTypes } from "@/components/ideas/idea-evidence";
import { IdeaMeta } from "@/components/ideas/idea-meta";
import { IdeaReelLink } from "@/components/ideas/idea-reel-link";
import { OwnIdeaBadge } from "@/components/ideas/own-idea-badge";
import { PlanBadge } from "@/components/ideas/plan-link";
import { RivalQuotes } from "@/components/ideas/rival-quotes";
import { ScrollIntoView } from "@/components/ideas/scroll-into-view";
import { ScriptSection } from "@/components/ideas/script-section";
import { StatusActions } from "@/components/ideas/status-actions";
import { TicketButton } from "@/components/studio-order/ticket-button";
import { CopyPromptButton } from "@/components/prompt/copy-prompt-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Hint } from "@/components/common/hint";
import type { Idea } from "@/lib/domain/intel";
import type { IdeaLink } from "@/lib/domain/outcomes";
import { formatDecimal } from "@/lib/format";
import { IDEA_PLAIN, OPENING_PLAIN } from "@/lib/plain-language-plan";
import { cn } from "@/lib/utils";

/**
 * "Bunu çek" fikir kartı: gerekçe, künye (konu, çerçeve, sonunda istenen, süre), dayandığı videolar, açılış cümlesi önerileri, rakip
 * alıntıları, senaryo ve açıklama taslağı, yayın bağı ("Bu fikir şu Reels oldu", öneri onayı, "Yayınlandı") ve durum geçişleri. Haftalık
 * plandan gelen fikirde plan rozeti + plana bağlantı vardır.
 * `idea.details` alanları isteğe bağlıdır: eski/elle eklenen fikirde boştur ve bu bölümler çizilmez.
 * `operator`: yönetici görünümü (sayfa `isOperatorMode()` ile verir) — öncelik puanı ve "Prompt olarak kopyala" yalnız orada çizilir.
 * `highlighted`: `?id=` ile gelinen kart; vurgulanır, ekrana kaydırılır ve senaryo bölümü açık gelir (D2-02).
 */
export function IdeaCard({
  idea,
  highlighted,
  suggestions,
  operator = false,
  orderId,
}: {
  idea: Idea;
  /** `?id=` ile gelinen kart vurgulanır. */
  highlighted?: boolean;
  /** Bu fikir için bekleyen otomatik yayın eşleşme önerileri (kullanıcı onaylar/reddeder). */
  suggestions?: readonly IdeaLink[];
  operator?: boolean;
  /** Fikrin etkin fişi (sayfa düzeyinde tek okuma); yoksa "Fiş hazırla" düğmesi çizilir. */
  orderId?: string;
}) {
  const hookTypes = ideaHookTypes(idea, idea.evidence);

  return (
    <Card id={`idea-${idea.id}`} className={cn("scroll-mt-4", highlighted && "ring-2 ring-primary")}>
      {highlighted ? <ScrollIntoView /> : null}
      <CardHeader>
        <CardTitle>{idea.title}</CardTitle>
        {operator ? (
          <CardAction>
            <Hint content={IDEA_PLAIN.scoreHint} label={IDEA_PLAIN.scoreLabel}>
              <Badge variant="outline" className="font-normal tabular">
                {IDEA_PLAIN.scoreLabel} <span className="font-mono">{formatDecimal(idea.rankScore, 2) ?? "—"}</span>
              </Badge>
            </Hint>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <PlatformBadge platform={idea.platform} />
          <FormatBadge format={idea.format} />
          {idea.source === "manual" ? <OwnIdeaBadge /> : null}
          {idea.source === "weekly_plan" || idea.weeklyPlan ? <PlanBadge weeklyPlan={idea.weeklyPlan} /> : null}
          {idea.source === "manual" && hookTypes.length === 0 ? null : hookTypes.length > 0 ? (
            hookTypes.map((type) => (
              <Badge key={type} variant="secondary">
                {OPENING_PLAIN.badge(type)}
              </Badge>
            ))
          ) : (
            <Hint content={OPENING_PLAIN.unknownHint} label={OPENING_PLAIN.unknownHint}>
              <Badge variant="outline" className="text-muted-foreground">
                {OPENING_PLAIN.unknown}
              </Badge>
            </Hint>
          )}
        </div>
        <p className="text-sm">{idea.rationale}</p>
        <IdeaMeta details={idea.details} />
        <EvidenceList evidence={idea.evidence} />
        <HookOptions hooks={idea.hooks} hookTypes={idea.details.hookTypes} />
        <RivalQuotes quotes={idea.details.quotes} />
        <ScriptSection steps={idea.scriptOutline} script={idea.details.script} language={idea.details.scriptLanguage} open={highlighted} />
        <DraftText title="Açıklama taslağı" text={idea.details.captionDraft} copyLabel="Açıklamayı kopyala" />
        <IdeaReelLink idea={idea} suggestions={suggestions} />
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusActions ideaId={idea.id} status={idea.status} />
          {idea.status === "dismissed" && !orderId ? null : <TicketButton ideaId={idea.id} orderId={orderId} />}
        </div>
        {operator ? <CopyPromptButton source={{ kind: "idea", ideaId: idea.id }} /> : null}
      </CardFooter>
    </Card>
  );
}
