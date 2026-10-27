"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Kabuk menülerinin (hesap seçici, profil menüsü) ortak görünümü: yuvarlak köşeli, yükselmiş yüzey. Açılır pencere `DropdownMenu`
 * (Base UI): ok tuşlarıyla gezilir, `Esc` kapatır, odak tetikleyiciye döner.
 */
export function ShellMenuContent({ className, ...props }: ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      align="end"
      sideOffset={8}
      className={cn("w-72 max-w-[calc(100vw-1.5rem)] rounded-card p-1.5 shadow-float motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

/** Menü satırı: dokunma hedefi dar ekranda 48 px, `md`+ 40 px. Etkin sayfa `aria-current` ile işaretlenir (yumuşak marka zemini). */
export const shellMenuRowClass =
  "flex min-h-tap w-full cursor-default items-center gap-3 rounded-inner px-3 text-[0.9375rem] outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground aria-[current=page]:bg-brand-soft aria-[current=page]:font-medium aria-[current=page]:text-brand-soft-foreground md:min-h-10 md:text-sm [&_svg]:size-[1.125rem] [&_svg]:shrink-0";

/** Menüde bir sayfaya giden satır (gerçek bağlantı: orta tık / yeni sekme çalışır); tıklanınca menü kapanır. */
export function ShellMenuLink({
  href,
  current,
  className,
  children,
}: {
  href: string;
  current?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <MenuPrimitive.LinkItem
      closeOnClick
      render={<Link href={href} />}
      aria-current={current ? "page" : undefined}
      className={cn(shellMenuRowClass, className)}
    >
      {children}
    </MenuPrimitive.LinkItem>
  );
}
