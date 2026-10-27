"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { switchWorkspace } from "@/app/actions/workspace";
import { callAction } from "@/components/common/call-action";
import { ONBOARDING_ADD_HREF } from "@/components/onboarding/add-intent";
import { ShellMenuContent, ShellMenuLink, shellMenuRowClass } from "@/components/shell/shell-menu";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Seçicide bir hesap: çalışma alanı kimliği + adı + (biliniyorsa) kullanıcı adı. */
export interface AccountOption {
  id: string;
  name: string;
  handle?: string;
}

/** Hesabın baş harfli yuvarlak işareti (gece mavisi; karar bloğuyla aynı yüzey). */
function AccountMark({ name, className }: { name: string; className?: string }) {
  const initial = [...name.trim()][0]?.toLocaleUpperCase("tr-TR") ?? "?";
  return (
    <span
      aria-hidden
      className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-focus-surface font-figure text-sm font-semibold text-focus-ink", className)}
    >
      {initial}
    </span>
  );
}

/**
 * Üst çubuktaki hesap seçici: hangi hesaba baktığını HER ZAMAN gösterir (ad + baş harf), tıklayınca hesaplarını listeler.
 * Geçiş açıksa (`accounts` verildi: yönetici modu + gerçek veri) satıra basmak hesabı değiştirir (server action; çerez + düzen yenilenir,
 * sunucu kimliği her istekte kayıtta doğrular). Geçiş kapalıysa liste yalnız geçerli hesaptır. "Hesap ekle" (başlangıç akışı, `/baslangic`)
 * geçişten BAĞIMSIZDIR: akışın kapısı açıksa (`canAddAccount`; örnek veride de) listenin altında görünür. Hesap eklemenin tek yeri burasıdır.
 */
export function AccountSwitcher({
  current,
  accounts,
  canAddAccount = false,
  className,
}: {
  current: AccountOption;
  /** Geçilebilecek hesaplar; `undefined` = geçiş bu ortamda kapalı (yalnız geçerli hesap gösterilir, "Hesap ekle" yok). */
  accounts?: readonly AccountOption[];
  /** Başlangıç akışı kapısı açık (`onboardingGate().open`, düzen verir): "Hesap ekle" satırı çizilir. */
  canAddAccount?: boolean;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const canSwitch = accounts !== undefined;
  const list = accounts !== undefined && accounts.length > 0 ? accounts : [current];

  function select(id: string) {
    if (!canSwitch || id === current.id) return;
    startTransition(async () => {
      const result = await callAction(() => switchWorkspace({ workspaceId: id }), "Hesap değiştirilemedi. Tekrar dene.");
      if (!result.ok) toast.error(result.message);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="account-switcher"
        aria-label={`Hesap: ${current.name}`}
        title={current.name}
        disabled={pending}
        className={cn(
          "flex h-12 max-w-full min-w-0 items-center gap-2 rounded-pill border bg-card py-0 pr-2.5 pl-1.5 text-left shadow-control outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 data-popup-open:bg-accent md:h-11",
          className,
        )}
      >
        <AccountMark name={current.name} />
        <span className="min-w-0 truncate text-sm font-semibold">{current.name}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <ShellMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 pt-1.5 pb-1">Hesapların</DropdownMenuLabel>
          {list.map((account) => {
            const selected = account.id === current.id;
            return (
              <DropdownMenuItem
                key={account.id}
                onClick={() => select(account.id)}
                data-selected={selected ? "" : undefined}
                className={cn(shellMenuRowClass, "h-auto py-1.5 md:py-1.5")}
              >
                <AccountMark name={account.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{account.name}</span>
                  {account.handle ? <span className="block truncate text-xs text-muted-foreground">@{account.handle}</span> : null}
                </span>
                {selected ? (
                  <>
                    <Check className="text-brand" aria-hidden />
                    <span className="sr-only">(seçili)</span>
                  </>
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        {canAddAccount ? (
          <>
            <DropdownMenuSeparator className="mx-1.5 my-1.5" />
            <ShellMenuLink href={ONBOARDING_ADD_HREF} className="text-muted-foreground">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed">
                <Plus aria-hidden />
              </span>
              Hesap ekle
            </ShellMenuLink>
          </>
        ) : null}
      </ShellMenuContent>
    </DropdownMenu>
  );
}
