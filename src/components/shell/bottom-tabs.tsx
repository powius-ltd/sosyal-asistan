"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_PRIMARY, primaryCurrent } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

/**
 * Alt çubuk (yalnız `md` altında): 4 ana madde, ikon + etiket. Etkin maddede ikon gece mavisi hapın içindedir ve etiket koyulaşır; alt
 * sayfadayken de üst madde etkin kalır (`primaryCurrent`). Panel düzeninde akış içinde en altta durur (içerik örtülmez); güvenli alan
 * dolgusu buradadır. Hedef boyu `--shell-bottom-nav` (`globals.css`, 64 px ≥ 48 px): sağ alttaki sohbet düğmesi AYNI değişkenle çubuğun
 * üstünde durur. Ayarlar, Bildirimler ve kulis üst çubuktaki profil menüsündedir.
 */
export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Ana gezinme" data-testid="bottom-tabs" className="shrink-0 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="mx-auto grid max-w-xl grid-cols-4 px-1">
        {NAV_PRIMARY.map((primary) => {
          const current = primaryCurrent(primary, pathname);
          const Icon = primary.icon;
          return (
            <li key={primary.id}>
              <Link
                href={primary.href}
                aria-current={current}
                className={cn(
                  "group flex h-(--shell-bottom-nav) w-full flex-col items-center justify-center gap-1 rounded-inner text-[0.8125rem] leading-none outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  current ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-7.5 w-14 place-items-center rounded-pill transition-[background-color,transform] duration-150 group-active:scale-90 motion-reduce:transition-none motion-reduce:group-active:scale-100",
                    current && "bg-nav-current text-nav-current-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                </span>
                {primary.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
