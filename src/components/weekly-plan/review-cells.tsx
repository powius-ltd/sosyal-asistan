import { CheckCheck, Hourglass } from "lucide-react";
import Link from "next/link";

import { ContentLink } from "@/components/common/content-link";
import { Hint } from "@/components/common/hint";
import { LiftBadge } from "@/components/common/lift-badge";
import { MeasuredValue } from "@/components/common/measured-value";
import { TAP, TAP_LINKS } from "@/components/weekly-plan/tap-target";
import { Badge } from "@/components/ui/badge";
import {
  CHECKPOINT_STATUS_LABEL,
  DIRECTION_VERDICT_LABEL,
  type Checkpoint,
  type CheckpointDay,
  type DirectionOutcome,
  type WeekReviewItem,
} from "@/lib/domain/outcomes";
import { DEFAULT_TIMEZONE, formatCompact, formatDateTime, formatDecimal } from "@/lib/format";
import { REVIEW_PLAIN } from "@/lib/plain-language-plan";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const VERDICT_STYLE: Record<DirectionOutcome["verdict"], string> = {
  held: "border-transparent bg-success-soft text-success-soft-foreground",
  missed: "border-transparent bg-danger-soft text-danger-soft-foreground",
  unmeasured: "border-transparent bg-muted text-muted-foreground",
};

export const checkpointOf = (item: WeekReviewItem, day: CheckpointDay): Checkpoint | undefined => item.checkpoints.find((c) => c.day === day);

/**
 * Hüküm ancak yayın bağlıysa VE 7. gün ölçümü varsa verilir (D2-04): ölçülmemiş şeye "tuttu / tutmadı / uymadı" denmez.
 * Tablo ve dar ekran kartı aynı kuralı kullanır.
 */
export const isVerdictMeasured = (item: WeekReviewItem): boolean => item.link?.status === "confirmed" && checkpointOf(item, 7)?.views !== undefined;

/** Yayın durumu: onaylı (yayınlandı) · içerik bekleniyor · bağlantı yok (yayınlandı mı bilinmiyor; fikir kartından bağlanır). */
export function LinkCell({ item, noun }: { item: WeekReviewItem; noun: string }) {
  const link = item.link;
  if (link?.status === "confirmed") {
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="outline" className="w-fit gap-1 border-transparent bg-success-soft text-success-soft-foreground">
          <CheckCheck aria-hidden />
          Yayınlandı
        </Badge>
        {link.content ? (
          <ContentLink id={link.content.contentItemId} externalUrl={link.content.url} className={TAP_LINKS}>{`@${link.content.ownerHandle}`}</ContentLink>
        ) : null}
        {item.publishedAt ? <span className="text-xs text-muted-foreground">{formatDateTime(item.publishedAt, DEFAULT_TIMEZONE)}</span> : null}
      </div>
    );
  }
  if (link?.status === "awaiting_content") {
    return (
      <Hint content={REVIEW_PLAIN.awaitingHint(noun)} label="İçerik bekleniyor">
        <Badge variant="outline" className="gap-1">
          <Hourglass aria-hidden />
          İçerik bekleniyor
        </Badge>
      </Hint>
    );
  }
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span>{REVIEW_PLAIN.noLink}</span>
      {item.suggestionCount > 0 ? <span>{item.suggestionCount} eşleşme önerisi onay bekliyor</span> : null}
      <Link
        href={`${ROUTES.ideas}?id=${encodeURIComponent(item.ideaId)}`}
        className={cn("inline-flex items-center font-medium text-foreground hover:underline", TAP)}
      >
        {REVIEW_PLAIN.linkAction(noun)}
      </Link>
    </div>
  );
}

/** 1./3./7. gün hücresi: izlenme + takipçi başına izlenme; ölçülmediyse "—" + durum (zamanında ölçülmedi ≠ 0). */
export function CheckpointCell({ checkpoint, align = "end" }: { checkpoint?: Checkpoint; align?: "start" | "end" }) {
  const reason = checkpoint?.reason ?? (checkpoint ? CHECKPOINT_STATUS_LABEL[checkpoint.status] : REVIEW_PLAIN.noLink7);
  return (
    <div className={cn("flex flex-col gap-0.5", align === "end" ? "items-end" : "items-start")}>
      <MeasuredValue value={checkpoint?.views} format={formatCompact} reason={reason} />
      {checkpoint?.views === undefined ? null : (
        <span className="text-xs text-muted-foreground">
          <MeasuredValue value={checkpoint.viewsPerFollower} format={(v) => `${formatDecimal(v, 2)}× ${REVIEW_PLAIN.followerSuffix}`} reason="Takipçi sayısı bilinmiyor." />
        </span>
      )}
    </div>
  );
}

/** 7. gündeki durum (normaline göre çarpan rozeti): yalnız 7. günde hesaplanır (olgunlaşmamış izlenme olgun normalle kıyaslanmaz). */
export function LiftCell({ checkpoint }: { checkpoint?: Checkpoint }) {
  if (checkpoint?.lift === undefined) {
    return <MeasuredValue value={undefined} reason={checkpoint?.reason ?? REVIEW_PLAIN.noDay7} />;
  }
  return <LiftBadge lift={checkpoint.lift} liftTier={checkpoint.liftTier} />;
}

export function VerdictCell({ item }: { item: WeekReviewItem }) {
  if (!isVerdictMeasured(item)) return <MeasuredValue value={undefined} inline reason={REVIEW_PLAIN.notMeasured} />;
  const { directions } = item;
  if (directions.length === 0) return <span className="text-xs text-muted-foreground">{REVIEW_PLAIN.noDirection}</span>;
  return (
    <ul className="flex flex-col gap-1">
      {directions.map((d) => {
        const label = d.verdict === "held" && d.strong ? "Güçlü tuttu" : DIRECTION_VERDICT_LABEL[d.verdict];
        const badge = (
          <Badge variant="outline" className={cn("gap-1", VERDICT_STYLE[d.verdict])} data-verdict={d.verdict}>
            {label}
          </Badge>
        );
        return (
          <li key={`${d.group}:${d.value}`} className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{d.label}</span>
            {d.reason ? (
              <Hint content={d.reason} label={`${label}: ${d.reason}`}>
                {badge}
              </Hint>
            ) : (
              badge
            )}
          </li>
        );
      })}
    </ul>
  );
}
