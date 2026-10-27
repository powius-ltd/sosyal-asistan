import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { linkButtonClass } from "@/components/content/link-button";
import { ALERT_SETTINGS_ANCHOR } from "@/components/notifications/alert-settings-state";
import { TAP_TARGET } from "@/components/notifications/tap";
import { NotificationTabs } from "@/components/notifications/notification-tabs";
import { parseNotificationParams } from "@/components/notifications/notification-params";
import { NotificationsTab } from "@/components/notifications/notifications-tab";
import { WeeklyDigestTab } from "@/components/notifications/weekly-digest-tab";
import { getPanelContext } from "@/lib/data";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Bildirimler" };

export default async function NotificationsPage({ searchParams }: PageProps<"/bildirimler">) {
  const params = parseNotificationParams(await searchParams);
  const { repo, wsId } = await getPanelContext();
  const [workspace, unreadCount] = await Promise.all([repo.getWorkspace(wsId), repo.countUnreadNotifications(wsId)]);
  const timeZone = workspace?.timezone ?? DEFAULT_TIMEZONE;

  return (
    <>
      <PageHeader
        title="Bildirimler"
        description="Rakibinin yeni tutan içeriği, kendi içeriğinin performansı ve haftalık özet burada toplanır."
        actions={
          <Link href={`${ROUTES.settings}#${ALERT_SETTINGS_ANCHOR}`} className={`${linkButtonClass("outline")} ${TAP_TARGET}`}>
            Uyarı ayarları
          </Link>
        }
      />
      <NotificationTabs active={params.tab} unreadCount={unreadCount} />
      {params.tab === "digest" ? (
        <WeeklyDigestTab timeZone={timeZone} />
      ) : (
        <NotificationsTab params={params} unreadCount={unreadCount} timeZone={timeZone} />
      )}
    </>
  );
}
