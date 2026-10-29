"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { approveWeeklyPlanAction } from "@/app/actions/weekly-plan";
import { callAction } from "@/components/common/call-action";
import { TAP } from "@/components/weekly-plan/tap-target";
import { Button } from "@/components/ui/button";
import { PLAN_SCREEN_PLAIN as T } from "@/lib/plain-language-plan";
import { cn } from "@/lib/utils";

/**
 * Plan başlığındaki "Planı onayla" düğmesi (SPN-35). Onayı yalnız bu düğme verir (sohbet vermez). Başarıda sayfa yenilenir:
 * başlık "Onaylandı · tarih" rozetine döner, plandaki fikirler seçilmiş olur. Para harcamaz, onay penceresi yok.
 */
export function ApprovePlanButton({ weekStart, className }: { weekStart: string; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const approve = () =>
    startTransition(async () => {
      const result = await callAction(() => approveWeeklyPlanAction({ weekStart }), T.approveFailed);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(T.approvedDone);
      router.refresh();
    });

  return (
    <Button type="button" size="sm" className={cn(TAP, className)} disabled={pending} onClick={approve}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
      {pending ? T.approving : T.approve}
    </Button>
  );
}
