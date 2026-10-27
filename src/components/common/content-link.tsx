import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ROUTES } from "@/lib/routes";
import { safeExternalUrl } from "@/lib/safe-url";
import { cn } from "@/lib/utils";

interface ContentLinkProps {
  /** content_items.id */
  id: string;
  /** Bağlantı metni (genellikle alt yazının ilk satırı). */
  children: ReactNode;
  /** Verilirse (ve http/https ise: `safeExternalUrl`) yanına platformdaki herkese açık içeriğe giden dış bağlantı ikonu eklenir. */
  externalUrl?: string;
  className?: string;
}

/** İçeriğin video analizi sayfasına (`/video/[id]`) bağlantı; isteğe bağlı platform bağlantısı. */
export function ContentLink({ id, children, externalUrl, className }: ContentLinkProps) {
  // Güvenlik burada: çağıran tarafın her seferinde süzmesine güvenilmez (tehlikeli şemalar hiç çizilmez).
  const safeUrl = safeExternalUrl(externalUrl);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Link href={ROUTES.video(id)} className="min-w-0 truncate font-medium hover:underline">
        {children}
      </Link>
      {safeUrl ? (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Platformda aç"
          title="Platformda aç (yeni sekmede)"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      ) : null}
    </span>
  );
}
