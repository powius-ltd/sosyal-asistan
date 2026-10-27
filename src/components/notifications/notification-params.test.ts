import { describe, expect, it } from "vitest";

import { notificationsHref, parseNotificationParams } from "@/components/notifications/notification-params";

describe("parseNotificationParams", () => {
  it("varsayılan: bildirim listesi, tümü, ilk sayfa", () => {
    expect(parseNotificationParams({})).toEqual({ tab: "list", unreadOnly: false, cursor: undefined });
  });

  it("sekme, okunmamış süzgeci ve imleç okunur; dizi değerde ilk eleman", () => {
    expect(parseNotificationParams({ okunmamis: "1", imlec: "20" })).toEqual({ tab: "list", unreadOnly: true, cursor: "20" });
    expect(parseNotificationParams({ sekme: ["ozet", "list"] }).tab).toBe("digest");
  });

  it("geçersiz değer sessizce yok sayılır; özet sekmesinde imleç anlamsızdır", () => {
    expect(parseNotificationParams({ sekme: "x", okunmamis: "evet" })).toEqual({ tab: "list", unreadOnly: false, cursor: undefined });
    expect(parseNotificationParams({ sekme: "ozet", imlec: "20" }).cursor).toBeUndefined();
    expect(parseNotificationParams({ imlec: "x".repeat(201) }).cursor).toBeUndefined();
  });
});

describe("notificationsHref", () => {
  it("varsayılanlar URL'ye yazılmaz", () => {
    expect(notificationsHref({})).toBe("/bildirimler");
    expect(notificationsHref({ tab: "list" })).toBe("/bildirimler");
  });

  it("süzgeç, imleç ve özet sekmesi", () => {
    expect(notificationsHref({ tab: "list", unreadOnly: true })).toBe("/bildirimler?okunmamis=1");
    expect(notificationsHref({ tab: "list", unreadOnly: true, cursor: "20" })).toBe("/bildirimler?okunmamis=1&imlec=20");
    expect(notificationsHref({ tab: "digest", unreadOnly: true, cursor: "20" })).toBe("/bildirimler?sekme=ozet");
  });

  it("ayrıştır → bağlantı üret gidiş-dönüşü", () => {
    const params = parseNotificationParams({ okunmamis: "1", imlec: "40" });
    expect(notificationsHref(params)).toBe("/bildirimler?okunmamis=1&imlec=40");
  });
});
