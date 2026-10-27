"use client";

import { Check, Unlink, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { resolveIdeaLinkAction, unlinkIdeaAction } from "@/app/actions/idea-links";
import { callAction } from "@/components/common/call-action";
import { TAP } from "@/components/weekly-plan/tap-target";
import { Button } from "@/components/ui/button";

/** Otomatik eşleşme önerisi için Onayla / Reddet. Onay fikri "Yayınlandı" yapar; red aynı çiftin tekrar önerilmesini engeller. */
export function SuggestionButtons({ linkId }: { linkId: string }) {
  const [pending, startTransition] = useTransition();

  function decide(decision: "confirm" | "reject") {
    startTransition(async () => {
      const result = await callAction(() => resolveIdeaLinkAction({ linkId, decision }), "Karar kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
      if (result.ok) toast.success(decision === "confirm" ? "Eşleşme onaylandı; fikir “Yayınlandı” oldu." : "Öneri reddedildi.");
      else toast.error(result.message);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" disabled={pending} className={TAP} onClick={() => decide("confirm")}>
        <Check aria-hidden />
        Onayla
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={pending} className={TAP} onClick={() => decide("reject")}>
        <X aria-hidden />
        Reddet
      </Button>
    </div>
  );
}

/** Aktif bağı kaldırır; onaylı bağ kalkınca fikir önceki durumuna döner. */
export function UnlinkButton({ ideaId }: { ideaId: string }) {
  const [pending, startTransition] = useTransition();

  function unlink() {
    startTransition(async () => {
      const result = await callAction(() => unlinkIdeaAction({ ideaId }), "Bağ kaldırılamadı. Bağlantını kontrol edip tekrar dene.");
      if (result.ok) toast.success("Reels bağı kaldırıldı.");
      else toast.error(result.message);
    });
  }

  return (
    <Button type="button" size="sm" variant="ghost" disabled={pending} className={TAP} onClick={unlink}>
      <Unlink aria-hidden />
      Bağı kaldır
    </Button>
  );
}
