import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { linkButtonClass } from "@/components/content/link-button";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";

/** Türkçe "bulunamadı" görünümü (D2-11): panel kabuğunun içinde (panel grubundaki not-found sayfaları) ve kabuksuz kök sayfada aynı metin. */
export function NotFoundView({
  title,
  description,
  secondary,
}: {
  title: string;
  description: string;
  /** İkinci bağlantı (ör. "İçeriklerim"); Bugün'e dönüş her zaman vardır. */
  secondary?: { href: string; label: string };
}) {
  const tap = "min-h-tap md:min-h-0";
  return (
    <EmptyState
      icon={FileQuestion}
      title={title}
      description={description}
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link href={ROUTES.overview} className={cn(linkButtonClass("default", "default"), tap)}>
            Bugün&apos;e dön
          </Link>
          {secondary ? (
            <Link href={secondary.href} className={cn(linkButtonClass("outline", "default"), tap)}>
              {secondary.label}
            </Link>
          ) : null}
        </div>
      }
    />
  );
}
