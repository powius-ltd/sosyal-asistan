import Link from "next/link";

import { Demirkazik } from "@/components/mascot/demirkazik";
import { AccountSwitcher, type AccountOption } from "@/components/shell/account-switcher";
import { NotificationBell } from "@/components/shell/notification-bell";
import { PrimaryNav } from "@/components/shell/primary-nav";
import { ProfileMenu } from "@/components/shell/profile-menu";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/lib/routes";

/**
 * Üst çubuk (her ekranda): solda marka (Demirkazık; Bugün'e götürür) + hesap seçici · ortada ana gezinme (yalnız `md`+; telefonda alt
 * çubuk) · sağda (örnek veri kaynağındayken, `lg`+) "Örnek veri" rozeti, tema düğmesi, bildirim zili, profil menüsü. Zemini sayfayla
 * aynıdır (çizgi yok): gezinme kapsülü ve düğmeler yükselmiş yüzeyde durur. Dar ekranda hesap adı kısalır, sağ küme sabit kalır.
 */
export function Topbar({
  brand,
  account,
  switchableAccounts,
  canAddAccount,
  operatorMode,
  isMockData,
  unreadNotifications,
}: {
  /** Marka / Maskot adı (`maskotName()`); düzen okur. */
  brand: string;
  /** Bakılan hesap (çalışma alanı). */
  account: AccountOption;
  /** Geçilebilecek hesaplar; `undefined` = geçiş kapalı (barındırma, örnek veri): seçici yalnız geçerli hesabı gösterir. */
  switchableAccounts?: readonly AccountOption[];
  /** Başlangıç akışı kapısı açık: hesap seçicide "Hesap ekle" görünür (geçişten bağımsız; örnek veride de). */
  canAddAccount?: boolean;
  operatorMode: boolean;
  isMockData: boolean;
  /** Okunmamış bildirim sayısı (`countUnreadNotifications`); okunamadıysa undefined (rozet gizlenir, 0 gösterilmez). */
  unreadNotifications?: number;
}) {
  return (
    <header data-testid="topbar" className="shrink-0 bg-background px-3 md:px-6">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-1.5 md:grid md:h-[4.5rem] md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-1 md:gap-3">
          <Link
            href={ROUTES.overview}
            aria-label={`${brand}: Bugün'e git`}
            className="flex h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-pill outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-11 md:min-w-11 xl:pr-2"
          >
            <Demirkazik state="waiting" className="size-8" />
            <span className="hidden font-figure text-base font-semibold tracking-tight xl:inline">{brand}</span>
          </Link>
          <AccountSwitcher current={account} accounts={switchableAccounts} canAddAccount={canAddAccount} />
        </div>
        <PrimaryNav backstage={operatorMode} />
        <div className="flex shrink-0 items-center justify-end gap-0.5 md:gap-1.5">
          {isMockData ? (
            <Badge variant="secondary" className="mr-1 hidden lg:inline-flex" title="Veriler örnek (mock) kaynaktan geliyor">
              Örnek veri
            </Badge>
          ) : null}
          <ThemeToggle className="size-12 rounded-full md:size-11" />
          <NotificationBell unreadCount={unreadNotifications} />
          <ProfileMenu operatorMode={operatorMode} unreadNotifications={unreadNotifications} isMockData={isMockData} />
        </div>
      </div>
    </header>
  );
}
