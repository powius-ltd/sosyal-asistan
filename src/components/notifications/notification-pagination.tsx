import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { notificationsHref } from "@/components/notifications/notification-params";
import { TAP_TARGET } from "@/components/notifications/tap";
import { buttonVariants } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface NotificationPaginationProps {
  unreadOnly: boolean;
  /** Geçerli sayfanın imleci; ilk sayfada yok. */
  cursor?: string;
  nextCursor?: string;
  /** Bu sayfadaki satır sayısı. */
  shown: number;
  /** Süzgece uyan toplam (biliniyorsa). */
  total?: number;
}

/** İleri yönlü (imleç) sayfalama: "İlk sayfa" ve "Sonraki sayfa". İmleç opaktır; geri gitmek için başa dönülür. */
export function NotificationPagination({ unreadOnly, cursor, nextCursor, shown, total }: NotificationPaginationProps) {
  if (!cursor && !nextCursor) return null;
  return (
    <nav aria-label="Sayfalama" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {total !== undefined ? `Toplam ${formatNumber(total)} bildirim · bu sayfada ${formatNumber(shown)}` : `Bu sayfada ${formatNumber(shown)} bildirim`}
      </p>
      <div className="flex items-center gap-2">
        {cursor ? (
          <Link href={notificationsHref({ tab: "list", unreadOnly })} className={cn(buttonVariants({ variant: "outline", size: "sm" }), TAP_TARGET)}>
            <ChevronLeft aria-hidden />
            İlk sayfa
          </Link>
        ) : null}
        {nextCursor ? (
          <Link
            href={notificationsHref({ tab: "list", unreadOnly, cursor: nextCursor })}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), TAP_TARGET)}
          >
            Sonraki sayfa
            <ChevronRight aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
