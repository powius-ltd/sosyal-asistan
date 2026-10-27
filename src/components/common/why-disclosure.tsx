import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface WhyDisclosureProps {
  /** Özet satırı; varsayılan "Neden?". */
  label?: ReactNode;
  children: ReactNode;
  /** Açılan katman kanıt zemininde mi çizilsin (varsayılan). `false`: yalnız aç/kapa (ör. "+2 iş daha"). */
  surface?: boolean;
  className?: string;
}

/**
 * "Neden?" katmanı: yerel `<details>` (JS yok; klavye ve ekran okuyucu hazır). Özet ≥ 44 px dokunma hedefi + ok; açılınca içerik
 * kanıt zemininde (`--evidence-surface`) görünür. Kanıt bağlantıları `EvidenceChip` ile yazılır.
 */
export function WhyDisclosure({ label = "Neden?", children, surface = true, className }: WhyDisclosureProps) {
  return (
    <details className={cn("group/why min-w-0", className)}>
      <summary className="flex min-h-tap md:min-h-11 w-fit cursor-pointer list-none items-center gap-1 rounded-md pr-2 text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown aria-hidden className="size-4 transition-transform duration-fast ease-out group-open/why:rotate-180" />
      </summary>
      <div
        data-slot="why-content"
        className={cn("flex flex-col gap-1", surface ? "rounded-md border border-evidence-border bg-evidence-surface px-3 py-2" : "pt-1")}
      >
        {children}
      </div>
    </details>
  );
}

/**
 * Kanıt çipi: bağlantının kendisi ≥ 44 × 44 px dokunma alanıdır, görünen çip içindeki küçük etikettir (satır yüksekliğini şişirmez).
 */
export function EvidenceChip({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("group/chip inline-flex min-h-tap min-w-tap md:min-h-11 md:min-w-11 items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
      <span className="rounded-md border border-evidence-border bg-card px-2 py-1 text-sm font-medium underline-offset-4 group-hover/chip:underline">
        {children}
      </span>
    </Link>
  );
}
