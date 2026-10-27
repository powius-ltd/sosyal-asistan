import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/** Video sayfasının geri bağlantısı ("‹ İçeriklerim"): dar ekranda 48 px yüksekliğinde dokunma hedefi (D2-11). */
export function VideoBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-mt-1 mb-1 inline-flex min-h-tap items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground md:min-h-0"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </Link>
  );
}
