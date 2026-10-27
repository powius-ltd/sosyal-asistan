// @vitest-environment jsdom
/**
 * Bildirim ekranları, GERÇEK mock depoyla (`getPanelContext`): async sunucu bileşenleri çağrılıp elemanı çizilir.
 * Action modülü taklit edilir (Next dışında `revalidatePath` çalışmaz); depo verisi gerçektir.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/notifications", () => ({
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { NotificationPagination } from "@/components/notifications/notification-pagination";
import { NotificationsTab } from "@/components/notifications/notifications-tab";
import { NOTIFICATION_PAGE_SIZE, parseNotificationParams } from "@/components/notifications/notification-params";
import { NotificationTabs } from "@/components/notifications/notification-tabs";
import { getPanelContext } from "@/lib/data";

describe("NotificationsTab", () => {
  it("liste: okunmamış satırlar 'Okundu' düğmesi taşır, okunmuşlar taşımaz; tümünü okundu yap açık", async () => {
    const { repo, wsId } = await getPanelContext();
    const all = await repo.listNotifications(wsId, { limit: NOTIFICATION_PAGE_SIZE });
    const unreadCount = await repo.countUnreadNotifications(wsId);
    render(await NotificationsTab({ params: parseNotificationParams({}), unreadCount, timeZone: "Europe/Istanbul" }));

    const rows = within(screen.getByRole("list", { name: "Bildirimler" })).getAllByRole("listitem");
    expect(rows).toHaveLength(all.items.length);
    const unreadRows = all.items.filter((n) => n.readAt === undefined).length;
    expect(screen.getAllByRole("button", { name: /^Okundu yap: / })).toHaveLength(unreadRows);
    expect(screen.getByRole("button", { name: "Tümünü okundu yap" })).toBeEnabled();
    expect(screen.getByRole("link", { name: `Okunmamış (${unreadCount})` })).toHaveAttribute("href", "/bildirimler?okunmamis=1");
  });

  it("okunmamış süzgeci yalnız okunmamışları gösterir", async () => {
    const { repo, wsId } = await getPanelContext();
    const unreadCount = await repo.countUnreadNotifications(wsId);
    render(await NotificationsTab({ params: parseNotificationParams({ okunmamis: "1" }), unreadCount, timeZone: "Europe/Istanbul" }));
    const rows = within(screen.getByRole("list", { name: "Bildirimler" })).getAllByRole("listitem");
    expect(rows).toHaveLength(unreadCount);
    for (const row of rows) expect(row).toHaveTextContent("Okunmamış:");
    expect(screen.getByRole("link", { name: "Okunmamış (" + unreadCount + ")" })).toHaveAttribute("aria-current", "true");
  });

  it("seed tek sayfaya sığar: sayfalama görünmez", async () => {
    const { repo, wsId } = await getPanelContext();
    const total = (await repo.listNotifications(wsId, { limit: 1 })).total ?? 0;
    expect(total).toBeLessThanOrEqual(NOTIFICATION_PAGE_SIZE);
    render(await NotificationsTab({ params: parseNotificationParams({}), unreadCount: 6, timeZone: "Europe/Istanbul" }));
    expect(screen.queryByRole("navigation", { name: "Sayfalama" })).not.toBeInTheDocument();
  });

  it("imleç seçilen sayfada boşsa ilk sayfaya dönüş sunar", async () => {
    render(await NotificationsTab({ params: parseNotificationParams({ imlec: "9999" }), unreadCount: 6, timeZone: "Europe/Istanbul" }));
    expect(screen.getByText("Bu sayfada bildirim yok")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /İlk sayfa/ }).length).toBeGreaterThan(0);
  });
});

describe("NotificationPagination", () => {
  it("sonraki sayfa bağlantısı imleci ve süzgeci taşır; ikinci sayfada ilk sayfaya dönüş vardır", () => {
    const { unmount } = render(<NotificationPagination unreadOnly cursor={undefined} nextCursor="20" shown={20} total={45} />);
    expect(screen.getByRole("link", { name: /Sonraki sayfa/ })).toHaveAttribute("href", "/bildirimler?okunmamis=1&imlec=20");
    expect(screen.queryByRole("link", { name: /İlk sayfa/ })).not.toBeInTheDocument();
    expect(screen.getByText("Toplam 45 bildirim · bu sayfada 20")).toBeInTheDocument();
    unmount();

    render(<NotificationPagination unreadOnly={false} cursor="20" nextCursor={undefined} shown={5} total={25} />);
    expect(screen.getByRole("link", { name: /İlk sayfa/ })).toHaveAttribute("href", "/bildirimler");
    expect(screen.queryByRole("link", { name: /Sonraki sayfa/ })).not.toBeInTheDocument();
  });

  it("tek sayfada hiçbir şey çizmez", () => {
    render(<NotificationPagination unreadOnly={false} shown={5} total={5} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("NotificationTabs", () => {
  it("etkin sekmeyi aria-current ile işaretler; okunmamış sayısı rozeti", () => {
    render(<NotificationTabs active="digest" unreadCount={6} />);
    expect(screen.getByRole("link", { name: "Haftalık özet" })).toHaveAttribute("aria-current", "page");
    const list = screen.getByRole("link", { name: /Bildirimler/ });
    expect(list).not.toHaveAttribute("aria-current");
    expect(list).toHaveAttribute("href", "/bildirimler");
    expect(list).toHaveTextContent("6");
    expect(screen.getByRole("link", { name: "Haftalık özet" })).toHaveAttribute("href", "/bildirimler?sekme=ozet");
  });
});
