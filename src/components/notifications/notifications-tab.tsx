import { Bell, BellOff } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { linkButtonClass } from "@/components/content/link-button";
import { MarkAllReadButton } from "@/components/notifications/mark-read-buttons";
import { NotificationPagination } from "@/components/notifications/notification-pagination";
import { NOTIFICATION_PAGE_SIZE, notificationsHref, type NotificationParams } from "@/components/notifications/notification-params";
import { NotificationRow } from "@/components/notifications/notification-row";
import { TAP_TARGET } from "@/components/notifications/tap";
import { getPanelContext } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface NotificationsTabProps {
  params: NotificationParams;
  /** Tüm okunmamışların sayısı (süzgeçten bağımsız; sayfa bir kez okur, sekme çubuğuyla paylaşılır). */
  unreadCount: number;
  timeZone: string;
}

/** "Bildirimler" sekmesi: süzgeç + "tümünü okundu yap" + liste + sayfalama. */
export async function NotificationsTab({ params, unreadCount, timeZone }: NotificationsTabProps) {
  const { repo, wsId } = await getPanelContext();
  const page = await repo.listNotifications(wsId, {
    unreadOnly: params.unreadOnly,
    limit: NOTIFICATION_PAGE_SIZE,
    cursor: params.cursor,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Bildirim süzgeci">
          <Link
            href={notificationsHref({ tab: "list" })}
            aria-current={params.unreadOnly ? undefined : "true"}
            className={cn(linkButtonClass(params.unreadOnly ? "ghost" : "secondary"), TAP_TARGET)}
          >
            Tümü
          </Link>
          <Link
            href={notificationsHref({ tab: "list", unreadOnly: true })}
            aria-current={params.unreadOnly ? "true" : undefined}
            className={cn(linkButtonClass(params.unreadOnly ? "secondary" : "ghost"), TAP_TARGET)}
          >
            Okunmamış ({formatNumber(unreadCount)})
          </Link>
        </div>
        <MarkAllReadButton unreadCount={unreadCount} />
      </div>

      {page.items.length === 0 ? (
        params.unreadOnly ? (
          <EmptyState
            icon={BellOff}
            title="Okunmamış bildirim yok"
            description="Hepsini okudun. Yeni bir gelişme olunca burada görünür."
            action={
              <Link href={notificationsHref({ tab: "list" })} className={cn(linkButtonClass("outline"), TAP_TARGET)}>
                Tüm bildirimleri göster
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={Bell}
            title={params.cursor ? "Bu sayfada bildirim yok" : "Bildirim yok"}
            description={
              params.cursor
                ? "Liste değişmiş olabilir; ilk sayfadan devam et."
                : "Uyarı kurallarına uyan bir gelişme olunca burada görünür."
            }
            action={
              params.cursor ? (
                <Link href={notificationsHref({ tab: "list" })} className={cn(linkButtonClass("outline"), TAP_TARGET)}>
                  İlk sayfa
                </Link>
              ) : undefined
            }
          />
        )
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Bildirimler">
          {page.items.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} timeZone={timeZone} />
          ))}
        </ul>
      )}

      <NotificationPagination
        unreadOnly={params.unreadOnly}
        cursor={params.cursor}
        nextCursor={page.nextCursor}
        shown={page.items.length}
        total={page.total}
      />
    </div>
  );
}
