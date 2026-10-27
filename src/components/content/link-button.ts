import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ButtonStyle = NonNullable<Parameters<typeof buttonVariants>[0]>;

/**
 * Düğme görünümlü `<Link>` sınıfı. `buttonVariants` tek başına `border-transparent` (taban) ile
 * `border-border` (outline) sınıflarını birlikte bırakır; `Button` bileşeni bunu `cn` (tailwind-merge)
 * ile çözer, bağlantılarda da aynısı gerekir — yoksa outline kenarlığı görünmez.
 */
export function linkButtonClass(variant: ButtonStyle["variant"] = "outline", size: ButtonStyle["size"] = "sm"): string {
  return cn(buttonVariants({ variant, size }));
}
