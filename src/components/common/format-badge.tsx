import { Clapperboard, Film, GalleryHorizontal, History, Image as ImageIcon, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { FORMAT_LABEL, type ContentFormat } from "@/lib/domain/platform";
import { cn } from "@/lib/utils";

const ICON: Record<ContentFormat, LucideIcon> = {
  short_video: Clapperboard,
  long_video: Film,
  image: ImageIcon,
  carousel: GalleryHorizontal,
  story: History,
};

/** İçerik biçimi rozeti (kısa video, karusel …). */
export function FormatBadge({ format, className }: { format: ContentFormat; className?: string }) {
  const Icon = ICON[format];
  return (
    <Badge variant="secondary" className={cn("gap-1", className)} data-format={format}>
      <Icon aria-hidden />
      {FORMAT_LABEL[format]}
    </Badge>
  );
}
