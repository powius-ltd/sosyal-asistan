"use client";

import { UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { locate, visibleMenuGroups } from "@/components/shell/nav-items";
import { ShellMenuContent, ShellMenuLink } from "@/components/shell/shell-menu";
import { BADGE_MAX } from "@/components/shell/unread-count";
import { DropdownMenu, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatNumber } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Profil menüsü (üst çubuğun sağ ucu): ana gezinmede yeri olmayan sayfalar. "Hesap" (Bildirimler, Ayarlar) herkese; "Kulis"
 * (İşler, Keşfet, Koleksiyonlar) YALNIZ yönetici modunda çizilir. Bu sayfalardan birindeyken düğme etkin görünür (`aria-current`)
 * ve satır işaretlidir. Örnek veri kaynağındayken menünün altında not vardır (dar ekranda üst çubuktaki rozet gizlidir).
 */
export function ProfileMenu({
  operatorMode,
  unreadNotifications,
  isMockData,
}: {
  operatorMode: boolean;
  /** Okunmamış bildirim sayısı; okunamadıysa undefined (sayı çizilmez, 0 gösterilmez). */
  unreadNotifications?: number;
  isMockData: boolean;
}) {
  const location = locate(usePathname());
  const inMenu = location?.area === "menu";
  const activeHref = inMenu ? location?.leaf?.href : undefined;
  const unread = unreadNotifications ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="profile-menu"
        aria-label="Profil menüsü"
        aria-current={inMenu ? "true" : undefined}
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-full border bg-card text-foreground shadow-control outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-accent md:size-11",
          inMenu && "border-transparent bg-nav-current text-nav-current-foreground hover:bg-nav-current data-popup-open:bg-nav-current",
        )}
      >
        <UserRound className="size-5" aria-hidden />
      </DropdownMenuTrigger>
      <ShellMenuContent>
        {visibleMenuGroups(operatorMode).map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 ? <DropdownMenuSeparator className="mx-1.5 my-1.5" /> : null}
            <DropdownMenuGroup data-testid={`menu-group-${group.id}`}>
              <DropdownMenuLabel className="px-3 pt-1.5 pb-1">{group.label}</DropdownMenuLabel>
              {group.items.map((leaf) => {
                const Icon = leaf.icon;
                const showUnread = leaf.href === ROUTES.notifications && unread > 0;
                return (
                  <ShellMenuLink key={leaf.href} href={leaf.href} current={leaf.href === activeHref}>
                    {Icon ? <Icon className="text-muted-foreground" aria-hidden /> : null}
                    <span className="flex-1">{leaf.label}</span>
                    {showUnread ? (
                      <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs leading-none font-semibold text-solid-foreground">
                        <span aria-hidden>{unread > BADGE_MAX ? `${BADGE_MAX}+` : formatNumber(unread)}</span>
                        <span className="sr-only">{`${formatNumber(unread)} okunmamış`}</span>
                      </span>
                    ) : null}
                  </ShellMenuLink>
                );
              })}
            </DropdownMenuGroup>
          </Fragment>
        ))}
        {isMockData ? (
          <p className="mt-1.5 border-t px-3 pt-2.5 pb-1.5 text-xs text-muted-foreground">Örnek veri gösteriliyor; gerçek hesap verisi değil.</p>
        ) : null}
      </ShellMenuContent>
    </DropdownMenu>
  );
}
