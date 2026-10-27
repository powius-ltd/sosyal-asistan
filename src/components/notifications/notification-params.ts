/**
 * `/bildirimler` URL durumu: sekme, "yalnız okunmamış" süzgeci ve sayfa imleci. Saf modül (sunucu ve testler kullanır).
 *
 * URL parametreleri: `sekme` (`ozet` = haftalık özet; yoksa bildirim listesi), `okunmamis` (`1`), `imlec`.
 * URL'ye güvenilmez: geçersiz değer sessizce yok sayılır.
 */
import { first, type RawSearchParams } from "@/lib/search-params";
import { ROUTES } from "@/lib/routes";

/** Bildirim listesinde sayfa başına satır. */
export const NOTIFICATION_PAGE_SIZE = 20;

export type NotificationTab = "list" | "digest";

export interface NotificationParams {
  tab: NotificationTab;
  unreadOnly: boolean;
  /** Sayfa imleci (opak); ilk sayfada yok. */
  cursor?: string;
}

const MAX_CURSOR_LENGTH = 200;

export function parseNotificationParams(raw: RawSearchParams): NotificationParams {
  const tab: NotificationTab = first(raw.sekme) === "ozet" ? "digest" : "list";
  const cursor = first(raw.imlec);
  return {
    tab,
    unreadOnly: first(raw.okunmamis) === "1",
    cursor: tab === "list" && cursor && cursor.length <= MAX_CURSOR_LENGTH ? cursor : undefined,
  };
}

/** Sekme/süzgeç/imleç değişiminde bağlantı; varsayılanlar URL'ye yazılmaz. Süzgeç değişince imleç sıfırlanır (çağıran `cursor` vermez). */
export function notificationsHref(params: Partial<NotificationParams>): string {
  const query = new URLSearchParams();
  if (params.tab === "digest") {
    query.set("sekme", "ozet");
  } else {
    if (params.unreadOnly) query.set("okunmamis", "1");
    if (params.cursor) query.set("imlec", params.cursor);
  }
  const qs = query.toString();
  return qs ? `${ROUTES.notifications}?${qs}` : ROUTES.notifications;
}
