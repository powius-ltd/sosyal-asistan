import Link from "next/link";

import { linkButtonClass } from "@/components/content/link-button";
import type { OwnAccount } from "@/lib/domain/competitor";
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Hesap seçici: "Tüm hesaplar" + her kendi hesap. Sunucu tarafında, düz bağlantılar
 * (`<basePath>?hesap=<id>`, varsayılan Sonuçlar sayfası: seçimi okuyan sayfa); JavaScript gerekmez. Tek hesap varsa seçilecek bir şey yoktur, gizlenir. Mobilde düğmeler 48 px yüksekliğindedir.
 */
interface AccountSwitcherProps {
  accounts: OwnAccount[];
  selectedId?: string;
  /** `?hesap=`'ı okuyan, seçicinin çizildiği sayfanın yolu; bağlantılar oraya gider (başka sayfaya düşürmez). */
  basePath?: string;
}

export function AccountSwitcher({ accounts, selectedId, basePath = ROUTES.results }: AccountSwitcherProps) {
  if (accounts.length < 2) return null;

  const items = [
    { key: "all", href: basePath, label: "Tüm hesaplar", active: selectedId === undefined },
    ...accounts.map((account) => ({
      key: account.id,
      href: `${basePath}?hesap=${encodeURIComponent(account.id)}`,
      label: `@${account.handle} · ${PLATFORM_LABEL[account.platform]}`,
      active: account.id === selectedId,
    })),
  ];

  return (
    <nav aria-label="Hesap seçici" className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "true" : undefined}
          // Mobilde ≥ 44 px dokunma alanı; masaüstünde sıkı düğme.
          className={cn(linkButtonClass(item.active ? "default" : "outline"), "h-tap px-3 md:h-7 md:px-2.5")}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
