import { Sparkles, Trophy } from "lucide-react";
import Link from "next/link";

import { ContentLink } from "@/components/common/content-link";
import { LiftBadge } from "@/components/common/lift-badge";
import { TOPIC_SECTION_ANCHOR } from "@/components/matrix/topic-hook-cell";
import { topicLabel, topicOpportunityText, winnerText } from "@/components/matrix/topic-text";
import type { TopicHookCell, TopicHookMatrix } from "@/lib/domain/topic-hook-matrix";
import { TOPIC_MAP_PLAIN } from "@/lib/matrix/plain";
import { topicCellHref } from "@/lib/matrix/topic-cell-param";
import { truncateText } from "@/lib/text";

/** Her listede gösterilen en çok satır. */
export const TOPIC_HIGHLIGHTS_SHOWN = 5;
const CAPTION_MAX_CHARS = 80;

const cellHref = (cell: TopicHookCell, video?: string) => `${topicCellHref({ clusterKey: cell.clusterKey, hookType: cell.hookType }, video)}#${TOPIC_SECTION_ANCHOR}`;

/**
 * "En iyi videoların": kendi hesabının tuttuğu kutular (`winners`, `compareTopicWinners` sırasıyla; rakipsiz hesapta tek öğrenme kaynağı).
 * Her satırın altında kutunun en iyi KENDİ videosu bağlanır.
 */
export function TopicWinners({ matrix, video }: { matrix: TopicHookMatrix; video?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Trophy className="size-4 text-primary" aria-hidden />
        {TOPIC_MAP_PLAIN.winners.title}
      </h3>
      {matrix.winners.length === 0 ? (
        <p className="text-sm text-muted-foreground">{TOPIC_MAP_PLAIN.winners.empty}</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-xl border" data-testid="topic-winners">
          {matrix.winners.slice(0, TOPIC_HIGHLIGHTS_SHOWN).map((cell, index) => {
            const best = cell.samples.find((sample) => sample.isOwn);
            return (
              <li key={`${cell.clusterKey}|${cell.hookType}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <Link href={cellHref(cell, video)} scroll={false} className="min-w-0 py-2 hover:underline md:py-0">
                    <span className="tabular mr-2 text-muted-foreground">{index + 1}.</span>
                    {winnerText(topicLabel(matrix, cell.clusterKey), cell)}
                  </Link>
                  {best ? (
                    <span className="text-xs text-muted-foreground">
                      {TOPIC_MAP_PLAIN.winners.best}
                      <ContentLink id={best.contentItemId} externalUrl={best.url} className="max-md:min-h-tap max-md:items-center">
                        {best.caption !== undefined ? truncateText(best.caption, CAPTION_MAX_CHARS) : `@${best.ownerHandle} videosu (alt yazı yok)`}
                      </ContentLink>
                    </span>
                  ) : null}
                </span>
                <LiftBadge lift={cell.own.medianLift} className="shrink-0" />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/**
 * "Denemediğin açılışlar": rakipte tuttuğu halde kendi hesabının denemediği kutular (`opportunities`, `compareTopicOpportunities` sırasıyla). İzlenen rakip
 * yoksa liste boştur ve bunun sebebi söylenir (fırsat için rakip izlenmeli); rakip varsa "kanıtlı fırsat yok" denir.
 */
export function TopicOpportunities({ matrix, hasRivals, video }: { matrix: TopicHookMatrix; hasRivals: boolean; video?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="size-4 text-success" aria-hidden />
        {TOPIC_MAP_PLAIN.opportunities.title}
      </h3>
      {matrix.opportunities.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {hasRivals ? TOPIC_MAP_PLAIN.opportunities.withRivals : TOPIC_MAP_PLAIN.opportunities.noRivals}
        </p>
      ) : (
        <ol className="flex flex-col divide-y rounded-xl border" data-testid="topic-opportunities">
          {matrix.opportunities.slice(0, TOPIC_HIGHLIGHTS_SHOWN).map((cell, index) => (
            <li key={`${cell.clusterKey}|${cell.hookType}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <Link href={cellHref(cell, video)} scroll={false} className="min-w-0 py-2 hover:underline md:py-0">
                <span className="tabular mr-2 text-muted-foreground">{index + 1}.</span>
                {topicOpportunityText(topicLabel(matrix, cell.clusterKey), cell)}
              </Link>
              <LiftBadge lift={cell.rivals.medianLift} className="shrink-0" />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
