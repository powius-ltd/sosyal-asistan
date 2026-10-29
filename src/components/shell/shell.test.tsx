// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pathname, switchWorkspace, toast } = vi.hoisted(() => ({
  pathname: { current: "/bu-hafta" },
  switchWorkspace: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@/app/actions/workspace", () => ({ switchWorkspace }));
vi.mock("sonner", () => ({ toast }));

import { ONBOARDING_ADD_HREF } from "@/components/onboarding/add-intent";
import { AccountSwitcher } from "@/components/shell/account-switcher";
import { BottomTabs } from "@/components/shell/bottom-tabs";
import { visibleMenuGroups } from "@/components/shell/nav-items";
import { NotificationBell } from "@/components/shell/notification-bell";
import { PrimaryNav } from "@/components/shell/primary-nav";
import { ProfileMenu } from "@/components/shell/profile-menu";
import { SectionTabs } from "@/components/shell/section-tabs";
import { Topbar } from "@/components/shell/topbar";
import { ROUTES } from "@/lib/routes";

const menuItems = (operatorMode: boolean) => visibleMenuGroups(operatorMode).flatMap((group) => group.items);
const ACCOUNTS = [
  { id: "ws-a", name: "Ornek", handle: "ornek" },
  { id: "ws-b", name: "Kahve Dükkanı", handle: "kahvedukkani" },
];
const PRIMARY_LINKS = [
  ["Bugün", ROUTES.overview],
  ["Plan", ROUTES.thisWeek],
  ["Videolar", ROUTES.content],
  ["Sonuçlar", ROUTES.results],
];
const linksOf = (nav: HTMLElement) => within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);
const currentOf = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole("link")
    .filter((link) => link.hasAttribute("aria-current"))
    .map((link) => [link.textContent, link.getAttribute("aria-current")]);

beforeEach(() => {
  vi.clearAllMocks();
  switchWorkspace.mockResolvedValue({ ok: true });
});

describe("NotificationBell", () => {
  it("/bildirimler'e bağlanır; okunmamış sayısı rozette ve erişilebilir adda; dokunma hedefi 48 px", () => {
    render(<NotificationBell unreadCount={6} />);
    const link = screen.getByRole("link", { name: "Bildirimler (6 okunmamış)" });
    expect(link).toHaveAttribute("href", ROUTES.notifications);
    expect(link).toHaveClass("size-12");
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("6");
  });

  it("okunmamış yoksa rozet çizilmez (0 gösterilmez); çok büyük sayı 99+ olur", () => {
    const { rerender } = render(<NotificationBell unreadCount={0} />);
    expect(screen.getByRole("link", { name: "Bildirimler" })).toBeInTheDocument();
    expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument();
    rerender(<NotificationBell unreadCount={250} />);
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("99+");
  });

  it("sayı okunamadıysa (undefined) rozet çizilmez ve ad sayı içermez", () => {
    render(<NotificationBell />);
    expect(screen.getByRole("link", { name: "Bildirimler" })).toHaveAttribute("href", ROUTES.notifications);
    expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument();
  });
});

describe("ana gezinme: üst çubuk (web) ve alt çubuk (telefon)", () => {
  it("ikisi de aynı 4 maddeyi çizer; üst çubuk yalnız md+, alt çubuk yalnız md altında (güvenli alan dolgulu, hedef --shell-bottom-nav boyunda)", () => {
    pathname.current = ROUTES.overview;
    const top = render(<PrimaryNav />);
    const topNav = screen.getByRole("navigation", { name: "Ana gezinme" });
    expect(topNav).toHaveClass("hidden", "md:block");
    expect(linksOf(topNav)).toEqual(PRIMARY_LINKS);
    top.unmount();

    render(<BottomTabs />);
    const bottomNav = screen.getByRole("navigation", { name: "Ana gezinme" });
    expect(bottomNav).toHaveClass("md:hidden");
    expect(bottomNav).toHaveClass("pb-[env(safe-area-inset-bottom)]");
    expect(linksOf(bottomNav)).toEqual(PRIMARY_LINKS);
    for (const link of within(bottomNav).getAllByRole("link")) expect(link).toHaveClass("h-(--shell-bottom-nav)");
    expect(within(bottomNav).queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([
    ["üst çubuk", PrimaryNav],
    ["alt çubuk", BottomTabs],
  ])("%s: etkin madde bellidir; alt sayfadayken üst madde etkin kalır; menü sayfasında hiçbiri etkin değil", (_name, Nav) => {
    const currentOn = (path: string) => {
      pathname.current = path;
      const view = render(<Nav />);
      const current = currentOf(screen.getByRole("navigation", { name: "Ana gezinme" }));
      view.unmount();
      return current;
    };
    expect(currentOn(ROUTES.overview)).toEqual([["Bugün", "page"]]);
    expect(currentOn(ROUTES.thisWeek)).toEqual([["Plan", "page"]]);
    expect(currentOn(ROUTES.ideas)).toEqual([["Plan", "true"]]);
    expect(currentOn(ROUTES.publish)).toEqual([["Videolar", "true"]]);
    expect(currentOn(ROUTES.anatomy)).toEqual([["Sonuçlar", "true"]]);
    expect(currentOn(ROUTES.video("ci_001"))).toEqual([["Sonuçlar", "true"]]);
    expect(currentOn(ROUTES.settings)).toEqual([]);
  });
});

describe("ikinci düzey sekme şeridi", () => {
  const tabsOn = (path: string) => {
    pathname.current = path;
    return render(<SectionTabs operatorMode />);
  };

  it("Plan: Bu hafta · Fikirler; etkin sekme aria-current=page; dokunma hedefi 48 px", () => {
    tabsOn(ROUTES.ideas);
    const nav = screen.getByRole("navigation", { name: "Plan bölümleri" });
    expect(linksOf(nav)).toEqual([
      ["Bu hafta", ROUTES.thisWeek],
      ["Fikirler", ROUTES.ideas],
    ]);
    expect(currentOf(nav)).toEqual([["Fikirler", "page"]]);
    for (const link of within(nav).getAllByRole("link")) expect(link).toHaveClass("min-h-tap");
  });

  it("Videolar: İçeriklerim · Yayın", () => {
    tabsOn(ROUTES.publish);
    const nav = screen.getByRole("navigation", { name: "Videolar bölümleri" });
    expect(linksOf(nav)).toEqual([
      ["İçeriklerim", ROUTES.content],
      ["Yayın", ROUTES.publish],
    ]);
    expect(currentOf(nav)).toEqual([["Yayın", "page"]]);
  });

  it("Sonuçlar: altı sekme, 'Neye dayanıyorum' kümesi ayraçla; şerit kendi içinde yatay kayar; /video/[id]'de sekmeler görünür ama hiçbiri etkin değil", () => {
    const view = tabsOn(ROUTES.hooks);
    const nav = screen.getByRole("navigation", { name: "Sonuçlar bölümleri" });
    expect(linksOf(nav)).toEqual([
      ["Özet", ROUTES.results],
      ["Tutanlar", ROUTES.outliers],
      ["Rakipler", ROUTES.competitors],
      ["Karşılaştırma", ROUTES.comparison],
      ["Kreatif anatomisi", ROUTES.anatomy],
      ["Açılış kütüphanesi", ROUTES.hooks],
      ["Reklamlar", ROUTES.ads],
    ]);
    expect(currentOf(nav)).toEqual([["Açılış kütüphanesi", "page"]]);
    expect(within(nav).getByText("Neye dayanıyorum")).toBeInTheDocument();
    expect(within(nav).getByRole("list")).toHaveClass("overflow-x-auto");
    view.unmount();

    tabsOn(ROUTES.video("ci_001"));
    expect(currentOf(screen.getByRole("navigation", { name: "Sonuçlar bölümleri" }))).toEqual([]);
  });

  it("Reklamlar sekmesi yalnız yönetici modunda çizilir; müşteri şeridinde yok", () => {
    pathname.current = ROUTES.ads;
    const operator = render(<SectionTabs operatorMode />);
    const nav = screen.getByRole("navigation", { name: "Sonuçlar bölümleri" });
    expect(linksOf(nav).at(-1)).toEqual(["Reklamlar", ROUTES.ads]);
    expect(currentOf(nav)).toEqual([["Reklamlar", "page"]]);
    operator.unmount();
    render(<SectionTabs />);
    // Müşteri görünümünde (kulis kapalı) ikinci düzey şerit hiç çizilmez.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("tek sayfalı maddede (Bugün), profil menüsü sayfalarında ve bilinmeyen yolda çizilmez", () => {
    for (const path of [ROUTES.overview, ROUTES.settings, ROUTES.discover, ROUTES.jobs, "/bilinmeyen"]) {
      const view = tabsOn(path);
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe("profil menüsü", () => {
  it("kapalı gelir; açılınca Hesap + (yönetici modunda) Kulis maddelerine bağlanır; Esc kapatır", async () => {
    pathname.current = ROUTES.overview;
    const user = userEvent.setup();
    render(<ProfileMenu operatorMode unreadNotifications={3} isMockData={false} />);
    const trigger = screen.getByRole("button", { name: "Profil menüsü" });
    expect(trigger).toHaveClass("size-12");
    expect(trigger).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger);
    const menu = await screen.findByRole("menu");
    const items = menuItems(true);
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(items.length);
    for (const item of items) {
      expect(within(menu).getByRole("menuitem", { name: new RegExp(`^${item.label}`) })).toHaveAttribute("href", item.href);
    }
    expect(within(menu).getByText("Hesap")).toBeInTheDocument();
    expect(within(menu).getByText("Kulis")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /^Bildirimler/ })).toHaveTextContent("3 okunmamış");
    expect(within(menu).queryByText(/Örnek veri/)).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("müşteri modunda kulis yok: yalnız Otomatik, Ayarlar ve Bildirimler; okunmamış yoksa sayı çizilmez; örnek veride not var", async () => {
    pathname.current = ROUTES.overview;
    const user = userEvent.setup();
    render(<ProfileMenu operatorMode={false} unreadNotifications={0} isMockData />);
    await user.click(screen.getByRole("button", { name: "Profil menüsü" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => [item.textContent, item.getAttribute("href")])).toEqual([
      ["Otomatik", ROUTES.automation],
      ["Ayarlar", ROUTES.settings],
      ["Bildirimler", ROUTES.notifications],
    ]);
    expect(within(menu).queryByText("Kulis")).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "İşler" })).not.toBeInTheDocument();
    expect(within(menu).getByText(/Örnek veri gösteriliyor/)).toBeInTheDocument();
  });

  it("menü sayfasındayken düğme etkin görünür ve satır işaretlidir", async () => {
    pathname.current = ROUTES.jobs;
    const user = userEvent.setup();
    render(<ProfileMenu operatorMode isMockData={false} />);
    const trigger = screen.getByRole("button", { name: "Profil menüsü" });
    expect(trigger).toHaveAttribute("aria-current", "true");
    await user.click(trigger);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "İşler" })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("menuitem", { name: "Ayarlar" })).not.toHaveAttribute("aria-current");
  });
});

describe("hesap seçici", () => {
  it("geçerli hesabı her zaman gösterir; geçiş kapalıyken liste yalnız o hesaptır ve 'Hesap ekle' yoktur", async () => {
    const user = userEvent.setup();
    render(<AccountSwitcher current={ACCOUNTS[0]} />);
    const trigger = screen.getByRole("button", { name: "Hesap: Ornek" });
    expect(trigger).toHaveTextContent("Ornek");
    expect(trigger).toHaveClass("h-12");
    await user.click(trigger);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    expect(within(menu).getByRole("menuitem", { name: /Ornek/ })).toHaveTextContent("@ornek");
    expect(within(menu).queryByText("Hesap ekle")).not.toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: /Ornek/ }));
    expect(switchWorkspace).not.toHaveBeenCalled();
  });

  it("geçiş açıkken hesapları listeler; seçim server action'ı kimlikle çağırır; geçerli hesap yeniden seçilirse çağrılmaz", async () => {
    const user = userEvent.setup();
    render(<AccountSwitcher current={ACCOUNTS[0]} accounts={ACCOUNTS} canAddAccount />);
    const trigger = screen.getByRole("button", { name: "Hesap: Ornek" });

    await user.click(trigger);
    let menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Ornek/ })).toHaveTextContent("(seçili)");
    expect(within(menu).getByRole("menuitem", { name: /Kahve Dükkanı/ })).toHaveTextContent("@kahvedukkani");
    expect(within(menu).getByRole("menuitem", { name: "Hesap ekle" })).toHaveAttribute("href", ONBOARDING_ADD_HREF);
    await user.click(within(menu).getByRole("menuitem", { name: /Ornek/ }));
    expect(switchWorkspace).not.toHaveBeenCalled();

    await user.click(trigger);
    menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /Kahve Dükkanı/ }));
    await waitFor(() => expect(switchWorkspace).toHaveBeenCalledExactlyOnceWith({ workspaceId: "ws-b" }));
  });

  it("'Hesap ekle' geçişten bağımsızdır: akışın kapısı açıksa geçiş kapalıyken de (örnek veri) görünür; kapı kapalıysa geçiş açık olsa da yoktur", async () => {
    const user = userEvent.setup();
    const first = render(<AccountSwitcher current={ACCOUNTS[0]} canAddAccount />);
    await user.click(screen.getByRole("button", { name: "Hesap: Ornek" }));
    let menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem", { name: /Ornek/ })).toHaveLength(1);
    expect(within(menu).getByRole("menuitem", { name: "Hesap ekle" })).toHaveAttribute("href", ONBOARDING_ADD_HREF);
    first.unmount();

    render(<AccountSwitcher current={ACCOUNTS[0]} accounts={ACCOUNTS} />);
    await user.click(screen.getByRole("button", { name: "Hesap: Ornek" }));
    menu = (await screen.findAllByRole("menu")).at(-1) as HTMLElement;
    expect(within(menu).queryByText("Hesap ekle")).not.toBeInTheDocument();
  });

  it("action hata dönerse Türkçe hata bildirimi gösterilir", async () => {
    switchWorkspace.mockResolvedValue({ ok: false, code: "invalid_state", message: "Çalışma alanı geçişi bu ortamda kapalı." });
    const user = userEvent.setup();
    render(<AccountSwitcher current={ACCOUNTS[0]} accounts={ACCOUNTS} />);
    await user.click(screen.getByRole("button", { name: "Hesap: Ornek" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: /Kahve Dükkanı/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Çalışma alanı geçişi bu ortamda kapalı."));
  });
});

describe("üst çubuk", () => {
  it("marka Bugün'e götürür; hesap seçici, ana gezinme, tema düğmesi, zil ve profil menüsü birlikte; uzun hesap adı kısaltılır (tam ad title'da)", () => {
    pathname.current = ROUTES.ideas;
    const longName = "Çok uzun bir hesap adı ".repeat(4).trim();
    render(<Topbar brand="Demirkazık" account={{ id: "ws-a", name: longName }} operatorMode isMockData unreadNotifications={3} />);
    const bar = screen.getByTestId("topbar");
    expect(within(bar).getByRole("link", { name: "Demirkazık: Bugün'e git" })).toHaveAttribute("href", ROUTES.overview);
    const switcher = within(bar).getByTestId("account-switcher");
    expect(switcher).toHaveAttribute("title", longName);
    expect(switcher.querySelector(".truncate")).toHaveTextContent(longName);
    expect(currentOf(within(bar).getByRole("navigation", { name: "Ana gezinme" }))).toEqual([["Plan", "true"]]);
    expect(within(bar).getByRole("button", { name: "Aydınlık ve karanlık tema arasında geç" })).toBeInTheDocument();
    expect(within(bar).getByTestId("notification-bell")).toHaveAccessibleName("Bildirimler (3 okunmamış)");
    expect(within(bar).getByRole("button", { name: "Profil menüsü" })).toBeInTheDocument();
    expect(within(bar).getByText("Örnek veri")).toHaveClass("hidden", "lg:inline-flex");
  });

  it("gerçek veri kaynağında 'Örnek veri' rozeti yok", () => {
    pathname.current = ROUTES.overview;
    render(<Topbar brand="Demirkazık" account={ACCOUNTS[0]} switchableAccounts={ACCOUNTS} operatorMode={false} isMockData={false} />);
    expect(screen.queryByText("Örnek veri")).not.toBeInTheDocument();
  });
});
