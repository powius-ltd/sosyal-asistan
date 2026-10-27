import { CalendarCheck } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { TAP } from "@/components/weekly-plan/tap-target";
import { planHref } from "@/components/weekly-plan/week-param";
import { weekRangeLabel } from "@/components/weekly-plan/plan-header";
import { JobCommand } from "@/components/workspace/job-command";
import { isOperatorMode } from "@/lib/workspace/operator-mode";
import { PLAN_SCREEN_PLAIN } from "@/lib/plain-language-plan";
import { cn } from "@/lib/utils";

/**
 * Plan yok ekranı. `requestedWeek`: kullanıcı belirli bir hafta istedi ama o haftanın planı yok → o haftayı söyler, o haftanın planını
 * hazırlayan iş düğmesini ve varsa en son plana götüren bağlantıyı verir; hiç plan yoksa yalnız plan düğmesi (varsayılan hafta). Düğme
 * yalnız işler panelden başlatılabiliyorken çizilir; müşteri görünümünde ne düğme ne komut vardır (`JobCommand`).
 */
export function PlanEmptyState({ requestedWeek, hasOtherPlans }: { requestedWeek?: string; hasOtherPlans: boolean }) {
  // Müşteri planı kendisi başlatamaz: ne zaman ve kim hazırlıyor sorusunu metin yanıtlar (yönetici düğmeyi görür).
  const operator = isOperatorMode();
  if (requestedWeek) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title={`${weekRangeLabel(requestedWeek) ?? requestedWeek} haftası için plan yok`}
        description={operator ? PLAN_SCREEN_PLAIN.emptyWeekOperator : PLAN_SCREEN_PLAIN.emptyWeekBody}
        action={
          <div className="flex flex-col items-center gap-3">
            <JobCommand request={{ kind: "plan", week: requestedWeek }} className="items-center" />
            {hasOtherPlans ? (
              <Link href={planHref()} className={cn(buttonVariants({ variant: "outline", size: "sm" }), TAP)}>
                En son planı göster
              </Link>
            ) : null}
          </div>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={CalendarCheck}
      title="Henüz plan yok"
      description={operator ? PLAN_SCREEN_PLAIN.emptyOperator : PLAN_SCREEN_PLAIN.emptyBody}
      action={<JobCommand request={{ kind: "plan" }} className="items-center" />}
    />
  );
}
