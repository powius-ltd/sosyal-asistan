"use client";

import { FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { createStudioOrderAction } from "@/app/actions/studio-orders";
import { callAction } from "@/components/common/call-action";
import { Button, buttonVariants } from "@/components/ui/button";
import { TAP } from "@/components/weekly-plan/tap-target";
import { TICKET_COPY } from "@/lib/copy/studio-order";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Fikir kartı ve plan öğesindeki TEK fiş düğmesi: fişi yoksa "Fiş hazırla" (action çağırır, sonra fişe gider); varsa "Fişi aç" (bağlantı).
 * Fiş varlığını sayfa verir (`orderId`; sayfa düzeyinde tek `listStudioOrders` okuması): düğme kendisi okumaz.
 */
export function TicketButton({ ideaId, orderId, className }: { ideaId: string; orderId?: string; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (orderId) {
    return (
      <Link href={ROUTES.ticket(orderId)} className={cn(buttonVariants({ variant: "outline", size: "sm" }), TAP, className)}>
        <FileText aria-hidden />
        {TICKET_COPY.button.open}
      </Link>
    );
  }

  const prepare = () =>
    startTransition(async () => {
      const result = await callAction(() => createStudioOrderAction(ideaId), "Fiş hazırlanamadı. Bağlantını kontrol edip tekrar dene.");
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.push(ROUTES.ticket(result.orderId));
    });

  return (
    <Button type="button" variant="outline" size="sm" className={cn(TAP, className)} disabled={pending} onClick={prepare}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <FileText aria-hidden />}
      {pending ? TICKET_COPY.button.preparing : TICKET_COPY.button.prepare}
    </Button>
  );
}
