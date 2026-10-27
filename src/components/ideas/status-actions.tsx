"use client";

import { Bookmark, CalendarClock, CheckCheck, FileText, RotateCcw, X, type LucideIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { updateIdeaStatusAction } from "@/app/actions/ideas";
import { IDEA_STATUS_LABEL } from "@/components/ideas/status-labels";
import { TAP } from "@/components/weekly-plan/tap-target";
import { Button } from "@/components/ui/button";
import { IDEA_TRANSITIONS, type IdeaStatus } from "@/lib/domain/intel";
import { IDEA_PLAIN } from "@/lib/plain-language-plan";

/** Hedef duruma götüren düğmenin fiili + ikonu. */
const ACTION: Record<IdeaStatus, { verb: string; icon: LucideIcon }> = {
  new: { verb: "Yeniye al", icon: RotateCcw },
  saved: { verb: "Kaydet", icon: Bookmark },
  scripted: { verb: "Script hazır", icon: FileText },
  scheduled: { verb: "Planlandı", icon: CalendarClock },
  published: { verb: "Yayınlandı", icon: CheckCheck },
  dismissed: { verb: "Ele", icon: X },
};

/**
 * Elenen fikri eski durumuna döndüren geçiş zinciri ("Geri al"): elenmişten yalnız "yeni"ye gidilir (`IDEA_TRANSITIONS`), oradan
 * eski duruma. Zincirdeki her adım sunucuda yine geçiş kuralından geçer.
 */
const RESTORE_PATH: Partial<Record<IdeaStatus, readonly IdeaStatus[]>> = {
  new: ["new"],
  saved: ["new", "saved"],
  scripted: ["new", "scripted"],
  scheduled: ["new", "scripted", "scheduled"],
};

async function restore(ideaId: string, previous: IdeaStatus): Promise<void> {
  for (const step of RESTORE_PATH[previous] ?? ["new"]) {
    const result = await updateIdeaStatusAction({ ideaId, status: step });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
  }
  toast.success(`Fikir “${IDEA_STATUS_LABEL[previous]}” durumuna döndü.`);
}

/**
 * Durum geçiş düğmeleri: yalnız `IDEA_TRANSITIONS`'ın izin verdiği hedefler gösterilir ve tıklanabilir.
 * Asıl doğrulama sunucudadır (`updateIdeaStatusAction`); istemci tarafı yalnız kullanıcı kolaylığı. "Ele" onaysızdır ama baloncukta
 * "Geri al" vardır (D2-12).
 */
export function StatusActions({ ideaId, status }: { ideaId: string; status: IdeaStatus }) {
  const [pending, startTransition] = useTransition();
  const targets = IDEA_TRANSITIONS[status];

  function move(next: IdeaStatus) {
    startTransition(async () => {
      const result = await updateIdeaStatusAction({ ideaId, status: next });
      if (result.ok && next === "dismissed") {
        toast.success(IDEA_PLAIN.dismissed, { duration: 10_000, action: { label: IDEA_PLAIN.undo, onClick: () => void restore(ideaId, status) } });
      } else if (result.ok) {
        toast.success(`Fikir “${IDEA_STATUS_LABEL[next]}” durumuna taşındı.`);
      } else {
        toast.error(result.message);
      }
    });
  }

  if (targets.length === 0) {
    return <p className="text-xs text-muted-foreground">Yayınlanmış fikrin durumu değiştirilemez.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Durumu değiştir:</span>
      {targets.map((target) => {
        const { verb, icon: Icon } = ACTION[target];
        return (
          <Button
            key={target}
            type="button"
            size="sm"
            variant={target === "dismissed" ? "destructive" : "outline"}
            disabled={pending}
            className={TAP}
            onClick={() => move(target)}
            title={`Durumu “${IDEA_STATUS_LABEL[target]}” yap`}
          >
            <Icon aria-hidden />
            {verb}
          </Button>
        );
      })}
    </div>
  );
}
