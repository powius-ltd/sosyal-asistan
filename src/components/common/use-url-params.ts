"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

import { TRAIL_PARAM } from "@/components/common/cursor-trail";

/**
 * Filtre durumunu URL `searchParams`'ında tutan küçük yardımcı (Keşfet, Tutan içerikler ve Hook kütüphanesi ortak kullanır).
 * `update({ anahtar: değer })`: değer `undefined`/"" ise anahtar silinir. Filtre değişince sayfalama
 * (`cursor` ve önceki sayfa izi) sıfırlanır; `cursor` açıkça verilirse korunur.
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = useCallback(
    (changes: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      if (!("cursor" in changes)) {
        next.delete("cursor");
        next.delete(TRAIL_PARAM);
      }
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  return { update, pending };
}
