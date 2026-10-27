// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pathname } = vi.hoisted(() => ({ pathname: { current: "/" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { SideNav } from "@/components/shell/copy/side-nav";
import { SIDE_NAV_STORAGE_KEY } from "@/components/shell/copy/use-side-nav-preference";
import { ROUTES } from "@/lib/routes";

const renderNav = (unread?: number) => render(<SideNav accountLabel="@ornek" unreadNotifications={unread} />);
const nav = () => screen.getByRole("navigation", { name: "Ana menü" });
const linksOf = () => within(nav()).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);
const currentOf = () =>
  within(nav())
    .getAllByRole("link")
    .filter((link) => link.hasAttribute("aria-current"))
    .map((link) => [link.textContent, link.getAttribute("aria-current")]);

beforeEach(() => {
  window.localStorage.clear();
  pathname.current = "/";
});

describe("SideNav (müşteri kopyası)", () => {
  it("beş ana madde + Bildirimler + Ayarlar, rotalar ROUTES'tan; hesap künyesi düz metin", () => {
    renderNav();
    expect(linksOf()).toEqual([
      ["Bugün", ROUTES.overview],
      ["Bu hafta", ROUTES.thisWeek],
      ["Fikirler", ROUTES.ideas],
      ["Videolarım", ROUTES.content],
      ["Sonuçlar", ROUTES.results],
      ["Bildirimler", ROUTES.notifications],
      ["Ayarlar", ROUTES.settings],
    ]);
    expect(screen.getByTestId("side-nav-account")).toHaveTextContent("@ornek");
    expect(within(nav()).queryByRole("combobox")).toBeNull();
  });

  it("Yayın, Karşılaştırma, Reklamlar, Kulis, hesap seçici, tema ve Demirkazık yok", () => {
    pathname.current = ROUTES.results;
    const { container } = renderNav();
    for (const text of ["Yayın", "Karşılaştırma", "Reklamlar", "Kulis", "İşler", "Keşfet", "Demirkazık"]) {
      expect(screen.queryByText(text)).toBeNull();
    }
    expect(container.querySelector('[data-slot="mascot"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /tema/i })).toBeNull();
  });

  it("Sonuçlar alt bağlantıları yalnız Sonuçlar bölgesinde görünür", () => {
    const view = renderNav();
    expect(screen.queryByTestId("side-nav-children")).toBeNull();
    view.unmount();
    pathname.current = ROUTES.outliers;
    renderNav();
    const children = screen.getByTestId("side-nav-children");
    expect(within(children).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Tutanlar", ROUTES.outliers],
      ["Rakipler", ROUTES.competitors],
      ["Neden tuttu", ROUTES.anatomy],
      ["Açılış kütüphanesi", ROUTES.hooks],
    ]);
    expect(currentOf()).toEqual([
      ["Sonuçlar", "true"],
      ["Tutanlar", "page"],
    ]);
  });

  it("etkin madde aria-current alır (Bu hafta / Fikirler ayrı; Bildirimler)", () => {
    pathname.current = ROUTES.ideas;
    const view = renderNav();
    expect(currentOf()).toEqual([["Fikirler", "page"]]);
    view.unmount();
    pathname.current = ROUTES.thisWeek;
    const second = renderNav();
    expect(currentOf()).toEqual([["Bu hafta", "page"]]);
    second.unmount();
    pathname.current = ROUTES.notifications;
    renderNav();
    expect(currentOf()).toEqual([["Bildirimler", "page"]]);
  });

  it("aç/kapa düğmesi daraltır: yalnız ikon, ad aria-label'da; tercih localStorage'a yazılır", async () => {
    const user = userEvent.setup();
    renderNav();
    expect(nav()).toHaveAttribute("data-open", "true");
    await user.click(screen.getByRole("button", { name: "Menüyü daralt" }));
    expect(nav()).toHaveAttribute("data-open", "false");
    expect(window.localStorage.getItem(SIDE_NAV_STORAGE_KEY)).toBe("closed");
    expect(screen.queryByTestId("side-nav-account")).toBeNull();
    expect(screen.getByRole("link", { name: "Bugün" })).toHaveAttribute("title", "Bugün");
    await user.click(screen.getByRole("button", { name: "Menüyü aç" }));
    expect(nav()).toHaveAttribute("data-open", "true");
    expect(window.localStorage.getItem(SIDE_NAV_STORAGE_KEY)).toBe("open");
  });

  it("kayıtlı kapalı tercih menüyü kapalı açar", () => {
    window.localStorage.setItem(SIDE_NAV_STORAGE_KEY, "closed");
    renderNav();
    expect(nav()).toHaveAttribute("data-open", "false");
  });

  it("okunmamış bildirim rozeti: sayı varsa çizilir ve adda geçer; 0 ya da bilinmiyorsa yok", () => {
    const view = renderNav(4);
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("4");
    expect(screen.getByRole("link", { name: "Bildirimler (4 okunmamış)" })).toBeInTheDocument();
    view.unmount();
    renderNav(undefined);
    expect(screen.queryByTestId("notification-badge")).toBeNull();
  });
});
