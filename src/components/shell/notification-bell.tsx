import { Bell } from "lucide-react";
import Link from "next/link";

import { BADGE_MAX } from "@/components/shell/unread-count";
import { formatNumber } from "@/lib/format";
import { ROUTES } from "@/lib/routes";

/**
 * Üst çubuk zili: `/bildirimler`e bağlanır, okunmamış sayısı rozette (0 ise rozet yok). `unreadCount` undefined ise
 * (sayı okunamadı) rozet ve sayı içeren ad da yoktur: bilinmeyen değer "0 okunmamış" gibi gösterilmez.
 * Dokunma hedefi dar ekranda 48 px, `md`+ 44 px.
 */
export function NotificationBell({ unreadCount }: { unreadCount?: number }) {
  const count = unreadCount ?? 0;
  const label = count > 0 ? `Bildirimler (${formatNumber(count)} okunmamış)` : "Bildirimler";
  return (
    <Link
      href={ROUTES.notifications}
      aria-label={label}
      title={label}
      data-testid="notification-bell"
      className="relative grid size-12 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:size-11"
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 ? (
        <span
          data-testid="notification-badge"
          className="tabular pointer-events-none absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] leading-none font-semibold text-solid-foreground ring-2 ring-background"
        >
          {count > BADGE_MAX ? `${BADGE_MAX}+` : formatNumber(count)}
        </span>
      ) : null}
    </Link>
  );
}
