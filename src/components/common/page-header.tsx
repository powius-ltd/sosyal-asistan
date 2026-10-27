import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Sağ üst köşe: birincil düğme, filtre vb. */
  actions?: ReactNode;
  /** Üst sayfaya dönüş bağlantısı (ör. video analizi → içerikler). */
  back?: { href: string; label: string };
  className?: string;
}

/**
 * Her panel sayfasının başlığı: başlık + açıklama + sağda eylemler. Başlık ölçeği 3 kademedir: sayfa 28 px (burada), bölüm/kart
 * 18 px (`text-lg`), madde 15 px; ara beden açılmaz.
 */
export function PageHeader({ title, description, actions, back, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {back ? (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground max-md:min-h-tap"
          >
            <ArrowLeft className="size-3" aria-hidden />
            {back.label}
          </Link>
        ) : null}
        <h1 className="font-heading text-[1.75rem] leading-tight font-medium tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
