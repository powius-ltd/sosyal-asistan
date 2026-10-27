"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_PRIMARY, primaryCurrent } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

/**
 * Üst çubuktaki ana gezinme (yalnız `md`+; telefonda yerini `BottomTabs` alır): hap biçimli kapsülde 4 madde. Etkin madde dolu gece
 * mavisi haptır; alt sayfadayken de üst madde etkin kalır (`primaryCurrent`). İkon dar masaüstünde (`md`–`lg`) gizlenir.
 */
export function PrimaryNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Ana gezinme" data-testid="primary-nav" className={cn("hidden md:block", className)}>
      <ul className="flex items-center gap-0.5 rounded-pill border bg-card p-1 shadow-control">
        {NAV_PRIMARY.map((primary) => {
          const current = primaryCurrent(primary, pathname);
          const Icon = primary.icon;
          return (
            <li key={primary.id}>
              <Link
                href={primary.href}
                aria-current={current}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-pill px-4 text-[0.9375rem] font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none lg:pr-5 lg:pl-3.5",
                  current
                    ? "bg-nav-current font-semibold text-nav-current-foreground shadow-control"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="hidden size-[1.125rem] shrink-0 lg:block" aria-hidden />
                {primary.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
