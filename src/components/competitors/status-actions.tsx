"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { setCompetitorStatusAction } from "@/app/actions/competitors";
import { RIVAL_PLAIN } from "@/lib/plain-language-account";
import { TAP_TARGET } from "@/components/notifications/tap";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Target = "tracked" | "ignored";
type RestoreStatus = "candidate" | "tracked" | "ignored";

interface StatusActionsProps {
  competitorId: string;
  handle: string;
  /** Hangi düğmeler görünsün: "İzle" (tracked) ve/veya "Yoksay" (ignored). */
  allow: readonly Target[];
  /** Satırın şimdiki durumu; verilirse sonuç baloncuğunda "Geri al" bu duruma döner (gizli / bulunamadı geri alınamaz: verilmez). */
  restoreTo?: RestoreStatus;
}

/** Baloncuk süresi: "Geri al"a basmak için yeterli (ms). */
const UNDO_DURATION_MS = 10_000;

/**
 * Rakip satırı için izle / yoksay düğmeleri. Sonuç sonner baloncuğuyla bildirilir; yoksayma ve izleme onaysız ve anında olduğundan
 * baloncukta "Geri al" vardır (D3-17). Yoksayılmış satırdaki izleme düğmesi "Yeniden izle"dir (geri alma değil, yeniden izlemedir).
 * Dar ekranda düğmeler ≥ 48 px (`min-h-tap`).
 */
export function CompetitorStatusActions({ competitorId, handle, allow, restoreTo }: StatusActionsProps) {
  const [pending, startTransition] = useTransition();

  async function undo(previous: RestoreStatus) {
    const result = await setCompetitorStatusAction({ competitorId, status: previous });
    if (result.ok) toast.success(RIVAL_PLAIN.undone(handle));
    else toast.error(result.message);
  }

  function apply(status: Target) {
    startTransition(async () => {
      const result = await setCompetitorStatusAction({ competitorId, status });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (restoreTo !== undefined && restoreTo !== status) {
        toast.success(result.message, { duration: UNDO_DURATION_MS, action: { label: RIVAL_PLAIN.undo, onClick: () => void undo(restoreTo) } });
      } else {
        toast.success(result.message);
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5 max-md:w-full md:justify-end">
      {allow.includes("tracked") ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => apply("tracked")}
          aria-label={`@${handle} hesabını ${restoreTo === "ignored" ? "yeniden " : ""}izle`}
          className={cn(TAP_TARGET, "max-md:flex-1")}
        >
          <Eye aria-hidden />
          {restoreTo === "ignored" ? RIVAL_PLAIN.rewatch : RIVAL_PLAIN.watch}
        </Button>
      ) : null}
      {allow.includes("ignored") ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => apply("ignored")}
          aria-label={`@${handle} hesabını yoksay`}
          className={cn(TAP_TARGET, "max-md:flex-1")}
        >
          <EyeOff aria-hidden />
          {RIVAL_PLAIN.ignore}
        </Button>
      ) : null}
    </div>
  );
}
