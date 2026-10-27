"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY, type ThemeChoice } from "@/lib/theme/theme-script";
import { cn } from "@/lib/utils";

/**
 * Aydınlık ↔ karanlık düğmesi (en küçük istemci yaprağı). İkon CSS'le seçilir (`dark:` değişkeni): sunucu ve istemci aynı işareti çizer,
 * hydration uyuşmazlığı ve yanlış ikon parlaması olmaz. Seçim `<html class>`'e uygulanır ve tarayıcıda saklanır; saklanamazsa
 * (özel pencere) o oturumda geçerli kalır.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const toggle = () => {
    const root = document.documentElement;
    const next: ThemeChoice = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* Saklama engelli: seçim yalnız bu sayfa ömrü boyunca geçerli. */
    }
  };
  return (
    <Button type="button" variant="ghost" size="icon" className={cn("size-11 text-muted-foreground", className)} onClick={toggle} aria-label="Aydınlık ve karanlık tema arasında geç">
      <Moon className="size-5 dark:hidden" aria-hidden />
      <Sun className="hidden size-5 dark:block" aria-hidden />
    </Button>
  );
}
