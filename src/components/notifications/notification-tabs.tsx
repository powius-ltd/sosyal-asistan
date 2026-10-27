import Link from "next/link";

import { notificationsHref, type NotificationTab } from "@/components/notifications/notification-params";
import { TAP_TARGET } from "@/components/notifications/tap";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const LINK_BASE =
  `md:h-[calc(100%-1px)] ${TAP_TARGET} inline-flex items-center gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`;
const LINK_ACTIVE = "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30";
const LINK_IDLE = "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground";

/**
 * Bildirimler / Haftalık özet sekmeleri. Sekme durumu URL'dedir (`?sekme=ozet`): sunucuda yalnız açık sekmenin verisi
 * okunur, bağlantı paylaşılabilir. Görünüm `ui/tabs` ile aynıdır; gezinme bağlantı olduğu için `aria-current` kullanılır.
 */
export function NotificationTabs({ active, unreadCount }: { active: NotificationTab; unreadCount: number }) {
  return (
    <nav
      aria-label="Bildirim bölümleri"
      className="mb-4 inline-flex w-fit md:h-8 items-center rounded-lg bg-muted p-[3px] text-muted-foreground"
    >
      <Link
        href={notificationsHref({ tab: "list" })}
        aria-current={active === "list" ? "page" : undefined}
        className={cn(LINK_BASE, active === "list" ? LINK_ACTIVE : LINK_IDLE)}
      >
        Bildirimler
        {unreadCount > 0 ? <span className="text-xs text-muted-foreground tabular">{formatNumber(unreadCount)}</span> : null}
      </Link>
      <Link
        href={notificationsHref({ tab: "digest" })}
        aria-current={active === "digest" ? "page" : undefined}
        className={cn(LINK_BASE, active === "digest" ? LINK_ACTIVE : LINK_IDLE)}
      >
        Haftalık özet
      </Link>
    </nav>
  );
}
