"use client";

import { useState, type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Küçük ipucu balonu: `children` üzerine gelince/odaklanınca `content` görünür. DOKUNMATİKTE de açılır: üzerine gelme olmadığı
 * için dokunuş balonu açar, başka yere dokununca (odak gidince) kapanır. Sunucu ve istemci bileşenlerinde kullanılabilir.
 * `label` verilirse ekran okuyucu için `aria-label` olarak eklenir (balon içeriği açılmadan da okunabilsin). Klavyeyle odağa gelince
 * görünür halka çizilir (balon açılır ama kullanıcı nerede olduğunu da görsün).
 */
export function Hint({
  content,
  children,
  label,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        // Dokunuşun ardından gelen tıklama balonu kapatmasın.
        closeOnClick={false}
        render={
          <span
            tabIndex={0}
            aria-label={label}
            className={cn("cursor-help rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
            onTouchEnd={() => setOpen(true)}
            onBlur={() => setOpen(false)}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}
