"use client";

import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSideNavPreference } from "@/components/shell/copy/use-side-nav-preference";
import { copyChildrenVisible, copyItemCurrent, leafCurrent, NAV_COPY, NAV_COPY_FOOTER } from "@/components/shell/nav-items";
import { BADGE_MAX } from "@/components/shell/unread-count";
import { formatNumber } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

interface SideNavProps {
  /** Menünün üstündeki düz metin: hesabın `@kullanıcı adı`; yoksa hesap adı. Değiştirme yok. */
  accountLabel: string;
  /** Okunmamış bildirim sayısı; `undefined` (okunamadı) = rozet yok. */
  unreadNotifications?: number;
}

const ITEM =
  "flex h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none";
const ITEM_IDLE = "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const ITEM_CURRENT = "bg-nav-current font-semibold text-nav-current-foreground";

/**
 * Müşteri kopyasının sol menüsü: açıkken ~224 px (ikon + yazı), kapalıyken ~60 px (yalnız ikon; ad `aria-label` + `title`). Tercih
 * `localStorage` `sp-side-nav`. Dar ekranda (`md` altı) kapalı görünür: yazılar gizlenir, düzen bozulmaz. Etkin madde `aria-current`
 * (`nav-items.ts` `locate` kuralı). Üstte hesap künyesi düz metindir (değiştirme / liste yok); altta Bildirimler + Ayarlar.
 */
export function SideNav({ accountLabel, unreadNotifications }: SideNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useSideNavPreference();
  const text = open ? "max-md:hidden" : "hidden";

  const link = (href: string, label: string, Icon: LucideIcon | undefined, current: "page" | "true" | undefined, extra?: React.ReactNode) => (
    <Link
      href={href}
      aria-current={current}
      aria-label={open ? undefined : label}
      title={open ? undefined : label}
      className={cn(ITEM, current ? ITEM_CURRENT : ITEM_IDLE, !open && "justify-center px-0", open && "max-md:justify-center max-md:px-0")}
    >
      {Icon ? <Icon className="size-5 shrink-0" aria-hidden /> : null}
      <span className={cn("min-w-0 flex-1 truncate", text)}>{label}</span>
      {extra}
    </Link>
  );

  const count = unreadNotifications ?? 0;
  const badge =
    count > 0 ? (
      <span
        data-testid="notification-badge"
        className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[0.6875rem] leading-none font-semibold text-solid-foreground"
      >
        {count > BADGE_MAX ? `${BADGE_MAX}+` : formatNumber(count)}
      </span>
    ) : null;

  return (
    <nav
      aria-label="Ana menü"
      data-testid="side-nav"
      data-open={open}
      className={cn(
        "flex h-full shrink-0 flex-col gap-1 border-r bg-sidebar px-2 py-3 transition-[width] duration-base motion-reduce:transition-none",
        open ? "w-56 max-md:w-15" : "w-15",
      )}
    >
      <div className={cn("flex items-center gap-1 pb-2", open ? "justify-between pl-2" : "justify-center")}>
        {open ? (
          <p data-testid="side-nav-account" className="min-w-0 truncate font-figure text-base font-semibold max-md:hidden">
            {accountLabel}
          </p>
        ) : null}
        <button
          type="button"
          aria-label={open ? "Menüyü daralt" : "Menüyü aç"}
          aria-expanded={open}
          title={open ? "Menüyü daralt" : "Menüyü aç"}
          onClick={() => setOpen(!open)}
          className="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 max-md:hidden"
        >
          {open ? <PanelLeftClose className="size-5" aria-hidden /> : <PanelLeftOpen className="size-5" aria-hidden />}
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {NAV_COPY.map((item) => (
          <li key={item.href}>
            {link(item.href, item.label, item.icon, copyItemCurrent(item, pathname))}
            {open && copyChildrenVisible(item, pathname) ? (
              <ul className="mt-1 ml-5 flex flex-col gap-0.5 border-l pl-2 max-md:hidden" data-testid="side-nav-children">
                {item.children?.map((child) => {
                  const current = leafCurrent(child, pathname);
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        aria-current={current}
                        className={cn(
                          "flex h-9 items-center rounded-md px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          current ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : ITEM_IDLE,
                        )}
                      >
                        {child.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      <ul className="mt-auto flex flex-col gap-1 border-t pt-2">
        {NAV_COPY_FOOTER.map((leaf) => {
          const isNotifications = leaf.href === ROUTES.notifications;
          const label = isNotifications && count > 0 ? `${leaf.label} (${formatNumber(count)} okunmamış)` : leaf.label;
          return (
            <li key={leaf.href}>
              <Link
                href={leaf.href}
                aria-current={leafCurrent(leaf, pathname)}
                aria-label={open && !isNotifications ? undefined : label}
                title={open ? undefined : label}
                className={cn(
                  ITEM,
                  leafCurrent(leaf, pathname) ? ITEM_CURRENT : ITEM_IDLE,
                  !open && "justify-center px-0",
                  open && "max-md:justify-center max-md:px-0",
                )}
              >
                {leaf.icon ? <leaf.icon className="size-5 shrink-0" aria-hidden /> : null}
                <span className={cn("min-w-0 flex-1 truncate", text)}>{leaf.label}</span>
                {isNotifications ? badge : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
