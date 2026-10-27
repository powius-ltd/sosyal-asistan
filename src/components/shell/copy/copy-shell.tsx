import { Suspense, type ReactNode } from "react";

import { ChatDockSlot } from "@/components/chat/chat-dock-slot";
import { JobStatusSlot } from "@/components/jobs/job-status-slot";
import { SideNav } from "@/components/shell/copy/side-nav";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

interface CopyShellProps {
  children: ReactNode;
  accountLabel: string;
  unreadNotifications?: number;
}

/**
 * Müşteri kopyası kabuğu (`PANEL_EDITION=kopya`): solda açılır-kapanır menü, ortada akış, sağda sabit Asistan sütunu (`ChatDockSlot`).
 * Üst çubuk, ikinci düzey sekmeler, alt çubuk, hesap seçici ve Demirkazık yoktur. İş durum şeridi ve bildirim baloncukları aynen kalır.
 */
export function CopyShell({ children, accountLabel, unreadNotifications }: CopyShellProps) {
  return (
    <TooltipProvider>
      <div className="flex h-dvh w-full overflow-hidden" data-testid="copy-shell">
        <SideNav accountLabel={accountLabel} unreadNotifications={unreadNotifications} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <JobStatusSlot />
          <div className="flex min-h-0 flex-1">
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pt-4 pb-24 md:px-8 md:pt-6">
              <div className="mx-auto w-full max-w-6xl">{children}</div>
            </main>
            <Suspense fallback={null}>
              <ChatDockSlot />
            </Suspense>
          </div>
        </div>
      </div>
      <Toaster position="top-center" mobileOffset={{ top: "calc(0.75rem + env(safe-area-inset-top))" }} />
    </TooltipProvider>
  );
}
