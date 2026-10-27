import { Image as ImageIcon, Play } from "lucide-react";

import type { ContentFormat } from "@/lib/domain/platform";
import { cn } from "@/lib/utils";

const VIDEO_FORMATS: readonly ContentFormat[] = ["short_video", "long_video", "story"];

/** Kapak yer tutucusu: içerik modelinde kapak görseli yok; biçime göre ikon gösterir. */
export function CoverPlaceholder({ format, className }: { format: ContentFormat; className?: string }) {
  const Icon = VIDEO_FORMATS.includes(format) ? Play : ImageIcon;
  return (
    <div
      className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}
      role="img"
      aria-label="Kapak görseli yok"
    >
      <Icon className="size-5" aria-hidden />
    </div>
  );
}
