import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { PAGER_PLAIN } from "@/lib/plain-language-results";
import { cn } from "@/lib/utils";

interface CursorPagerProps {
  /** "Toplam 19 içerik · bu sayfada 19" gibi özet. */
  summary: string;
  /** Bir önceki sayfa (ilk sayfada yok). */
  previousHref?: string;
  /** İlk sayfa: yalnız ikinci sayfadan uzakta ("Önceki sayfa" zaten ilk sayfaya götürüyorsa gösterilmez). */
  firstHref?: string;
  nextHref?: string;
}

const LINK = cn(buttonVariants({ variant: "outline", size: "sm" }), "max-md:min-h-tap");

/** İleri yönlü (imleçli) sayfalama: "İlk sayfa", "Önceki sayfa", "Sonraki sayfa" bağlantıları. Tutanlar ve Açılış kütüphanesi ortak kullanır. */
export function CursorPager({ summary, previousHref, firstHref, nextHref }: CursorPagerProps) {
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label={PAGER_PLAIN.label}>
      <p className="text-sm text-muted-foreground">{summary}</p>
      <div className="flex flex-wrap items-center gap-2">
        {firstHref ? (
          <Link href={firstHref} className={LINK}>
            <ChevronLeft aria-hidden />
            {PAGER_PLAIN.first}
          </Link>
        ) : null}
        {previousHref ? (
          <Link href={previousHref} className={LINK} rel="prev">
            <ChevronLeft aria-hidden />
            {PAGER_PLAIN.previous}
          </Link>
        ) : null}
        {nextHref ? (
          <Link href={nextHref} className={LINK} rel="next">
            {PAGER_PLAIN.next}
            <ChevronRight aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
