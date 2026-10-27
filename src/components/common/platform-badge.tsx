import { Badge } from "@/components/ui/badge";
import { PLATFORM_LABEL, type Platform } from "@/lib/domain/platform";
import { cn } from "@/lib/utils";

const DOT: Record<Platform, string> = {
  instagram: "bg-platform-instagram",
  tiktok: "bg-platform-tiktok",
  youtube: "bg-platform-youtube",
};

/** Platform rozeti: renkli nokta + ad. */
export function PlatformBadge({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", className)} data-platform={platform}>
      <span className={cn("size-1.5 rounded-full", DOT[platform])} aria-hidden />
      {PLATFORM_LABEL[platform]}
    </Badge>
  );
}
