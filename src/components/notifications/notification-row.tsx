import { Check } from "lucide-react";
import Link from "next/link";

import { ContentLink } from "@/components/common/content-link";
import { MarkReadButton } from "@/components/notifications/mark-read-buttons";
import { NOTIFICATION_KIND_META } from "@/components/notifications/notification-kinds";
import { notificationsHref } from "@/components/notifications/notification-params";
import { TAP_FIRST_LINK, TAP_TARGET, WRAP_FIRST_LINK } from "@/components/notifications/tap";
import { Card, CardContent } from "@/components/ui/card";
import type { Notification } from "@/lib/domain/notification";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Bildirim satırı: tür ikonu, başlık (içerik varsa `ContentLink`), gövde, tür · zaman. Okunmamış satır vurgulanır ve
 * "Okundu" düğmesi taşır (istemci yaprağı); okunmuş satırda düğme yoktur. Haftalık özet bildirimi özet sekmesine bağlanır.
 */
export function NotificationRow({ notification, timeZone }: { notification: Notification; timeZone: string }) {
  const unread = notification.readAt === undefined;
  const { icon: Icon, label, action } = NOTIFICATION_KIND_META[notification.kind];

  return (
    <li>
      <Card size="sm" className={cn(unread && "ring-1 ring-primary/40")} data-unread={unread}>
        <CardContent className="flex items-start gap-3">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-start gap-2 text-sm">
              {unread ? (
                <>
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span className="sr-only">Okunmamış:</span>
                </>
              ) : null}
              {notification.contentId ? (
                <ContentLink id={notification.contentId} className={cn(TAP_FIRST_LINK, WRAP_FIRST_LINK, unread && "font-semibold")}>
                  {notification.title}
                </ContentLink>
              ) : (
                <span className={cn("min-w-0 break-words", unread ? "font-semibold" : "font-medium")}>{notification.title}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{notification.body}</p>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span>
                {label} · {formatDateTime(notification.createdAt, timeZone)}
              </span>
              {action ? (
                <Link href={action.href} className={cn("inline-flex items-center font-medium text-foreground hover:underline", TAP_TARGET)}>
                  {action.label}
                </Link>
              ) : null}
              {notification.kind === "weekly_digest" ? (
                <Link href={notificationsHref({ tab: "digest" })} className={cn("inline-flex items-center font-medium text-foreground hover:underline", TAP_TARGET)}>
                  Özeti aç
                </Link>
              ) : null}
            </p>
            {unread ? (
              <MarkReadButton id={notification.id} title={notification.title} className="mt-1 self-start" />
            ) : (
              <span className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
                <Check className="size-3.5" aria-hidden />
                Okundu
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
