import { ArrowRight, CalendarCheck } from "lucide-react";
import Link from "next/link";

import { AI_VOICE_CLASS } from "@/components/common/ai-surface";
import { EmptyState } from "@/components/common/empty-state";
import { linkButtonClass } from "@/components/content/link-button";
import { PlanItemStatusBadge } from "@/components/overview/plan-item-status-badge";
import { weekRangeLabel } from "@/components/weekly-plan/plan-header";
import { SlotTime } from "@/components/weekly-plan/slot-time";
import { planHref } from "@/components/weekly-plan/week-param";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobCommand } from "@/components/workspace/job-command";
import type { WeeklyPlan } from "@/lib/domain/weekly-plan";
import { formatNumber } from "@/lib/format";
import { planItemStatuses, type PlanItemStatus } from "@/lib/overview/plan-item-status";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Kartta gösterilen içerik sayısı (planın tamamı `/bu-hafta`'da). */
export const PLAN_CARD_ITEM_LIMIT = 3;

/** Çekilmesi beklenen (henüz yayınlanmamış) maddelerde slot saati yazılır; yayınlanmışlarda yazılmaz. */
const SLOT_SHOWN: ReadonlySet<PlanItemStatus["kind"]> = new Set(["next", "to_shoot", "not_shot"]);

interface WeeklyPlanCardProps {
  /** En son plan; `null` hiç plan yok, `undefined` okunamadı. */
  plan: WeeklyPlan | null | undefined;
  /** Madde durumları (`planItemStatuses`, `plan.items` ile aynı sırada). Verilmezse sonuç okuması olmadan hesaplanır. */
  statuses?: readonly PlanItemStatus[];
  /** İçinde bulunulan haftanın Pazartesi'si (istek saatinden); plan daha eski haftaysa kart bunu söyler. */
  currentWeekStart?: string;
  /** Yönetici modu: boş durumda planı hazırlayan iş düğmesi görünür (işler panelden başlatılamıyorsa yerine komut metni yedek kalır). */
  operator?: boolean;
  className?: string;
}

/**
 * Genel bakış — "Bu haftanın planı": ilk 3 içerik + durumu (Sırada / Çekilecek / Yayınlandı / Sonucu bekleniyor / sonuç), sıradaki
 * çekim vurgulu, tek birincil düğme "Planı aç". Madde satırının tamamı fikir kartına bağlıdır (dokunma alanı satırın tümü).
 */
export function WeeklyPlanCard({ plan, statuses, currentWeekStart, operator = false, className }: WeeklyPlanCardProps) {
  if (!plan) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg">Bu haftanın planı</CardTitle>
        </CardHeader>
        <CardContent>
          {plan === undefined ? (
            <p className="text-sm text-muted-foreground">Planı şu an okuyamadım.</p>
          ) : (
            <EmptyState
              icon={CalendarCheck}
              title="Henüz plan yok"
              description="Plan hazır olunca burada göreceksin."
              action={operator ? <JobCommand request={{ kind: "plan" }} className="items-center" /> : undefined}
              className="py-6"
            />
          )}
        </CardContent>
      </Card>
    );
  }

  const states = statuses ?? planItemStatuses(plan, undefined, currentWeekStart);
  const shown = plan.items.slice(0, PLAN_CARD_ITEM_LIMIT);
  const hidden = plan.items.length - shown.length;
  const stale = currentWeekStart !== undefined && plan.weekStart < currentWeekStart;
  const audienceTimeZone = plan.sections.schedule.audienceTimeZone;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">Bu haftanın planı</CardTitle>
        <CardDescription>
          {weekRangeLabel(plan.weekStart) ?? plan.weekStart}
          {stale ? " · bu hafta için plan henüz üretilmedi, son plan gösteriliyor" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu plana alınmış içerik yok.</p>
        ) : (
          // Kart içinde kutu yok: maddeler ince çizgiyle ayrılan satırlardır; sıradaki çekim "sıra sende" zeminiyle ayrışır.
          <ol className="flex flex-col divide-y" aria-label="Planın ilk içerikleri">
            {shown.map((item, index) => {
              const status: PlanItemStatus = states[index] ?? { kind: "to_shoot" };
              return (
                <li
                  key={item.ideaId}
                  data-status={status.kind}
                  className={cn("relative flex min-w-0 flex-col gap-1.5 px-3 py-3", status.kind === "next" && "rounded-md bg-awaiting-soft")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <PlanItemStatusBadge status={status} />
                    {SLOT_SHOWN.has(status.kind) ? <SlotTime at={item.slotAt} audienceTimeZone={audienceTimeZone} className="text-xs" /> : null}
                  </div>
                  <Link
                    href={`${ROUTES.ideas}?id=${encodeURIComponent(item.ideaId)}`}
                    className={cn(AI_VOICE_CLASS, "line-clamp-2 leading-snug font-medium after:absolute after:inset-0 hover:underline")}
                  >
                    {item.idea.title}
                  </Link>
                  {status.resultPhrase !== undefined ? (
                    <p className="text-xs text-muted-foreground">Videon {status.resultPhrase}.</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href={planHref(plan.weekStart)} className={cn(linkButtonClass("default", "touch"), "w-full sm:w-auto")}>
            Planı aç
            {hidden > 0 ? <span className="font-normal opacity-80">(+{formatNumber(hidden)} içerik)</span> : null}
            <ArrowRight aria-hidden />
          </Link>
          <Link
            href={`${planHref(plan.weekStart)}#focus`}
            className="inline-flex min-h-tap items-center text-sm font-medium underline-offset-4 hover:underline"
          >
            Neden bu plan?
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
