"use client";

import { Check, CheckCheck } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/notifications";
import { TAP_TARGET } from "@/components/notifications/tap";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Tek bildirimi okundu yapar. Sonuç sunucu yeniden çizimiyle listeye ve zil rozetine yansır; hata toast ile.
 * `title`: erişilebilir ad bağlamı (listede aynı görünen çok sayıda düğmeyi ekran okuyucuda ayırır).
 */
export function MarkReadButton({ id, title, className }: { id: string; title: string; className?: string }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await markNotificationReadAction({ id });
      if (!result.ok) toast.error(result.message);
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" className={cn(TAP_TARGET, className)} onClick={onClick} disabled={pending} aria-label={`Okundu yap: ${title}`}>
      <Check aria-hidden />
      Okundu yap
    </Button>
  );
}

/** Tüm okunmamışları okundu yapar; okunmamış yoksa devre dışı. */
export function MarkAllReadButton({ unreadCount }: { unreadCount: number }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await markAllNotificationsReadAction();
      if (result.ok) toast.success(`${formatNumber(result.marked)} bildirim okundu yapıldı.`);
      else toast.error(result.message);
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" className={TAP_TARGET} onClick={onClick} disabled={pending || unreadCount === 0}>
      <CheckCheck aria-hidden />
      Tümünü okundu yap
    </Button>
  );
}
