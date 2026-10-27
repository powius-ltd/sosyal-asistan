"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/** Geniş ekranda sağ sabit sütun (akışta): tam yükseklik, sol kenarlık. Demirkazık yoktur. */
export function ChatDockAside({ children }: { children: ReactNode }) {
  return (
    <aside aria-label="Asistan" data-testid="chat-dock-aside" className="flex h-full min-h-0 w-96 shrink-0 flex-col border-l bg-card">
      {children}
    </aside>
  );
}

/** Sade başlık: "Asistan" + Sohbeti kapat. */
export function ChatDockAsideHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b py-1 pr-2 pl-4">
      <h2 className="truncate text-base font-medium">{title}</h2>
      <Button type="button" variant="ghost" size="icon" className="size-tap" aria-label="Sohbeti kapat" onClick={onClose}>
        <X aria-hidden />
      </Button>
    </div>
  );
}
