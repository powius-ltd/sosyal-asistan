import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { JobCommand } from "@/components/workspace/job-command";
import type { BriefingAction as BriefingActionModel } from "@/lib/domain/briefing";
import { briefingActionCommand, briefingActionHref } from "@/lib/domain/briefing-refs";
import { JOB_KIND_BY_COMMAND } from "@/lib/domain/panel-job";
import type { WorkspaceCommandRef } from "@/lib/workspace/command";

/**
 * Maddenin isteğe bağlı eylemi: sayfa bağlantısı ya da iş düğmesi. İş yalnız `BRIEFING_COMMANDS` tablosundan gelir (kimlikten; tür
 * eşlemesi `JOB_KIND_BY_COMMAND`) ve düğme adı sözlüktendir. İş eylemi YÖNETİCİ bilgisidir: yalnız `operator` iken çizilir. İşler
 * panelden başlatılamıyorsa düğmenin yerine komut metni yedek kalır (`JobCommand`): kartın çalışma alanını taşır, para harcayan komutta
 * açık "Para harcar" etiketi vardır (tablodaki değer esastır, satırdaki `spendsMoney` değil). Çözülemeyen eylem (bozuk hedef / komut
 * kimliği) çizilmez.
 */
export function BriefingActionView({
  action,
  workspace,
  operator = false,
}: {
  action: BriefingActionModel;
  workspace: WorkspaceCommandRef;
  operator?: boolean;
}) {
  if (action.type === "run_cmd") {
    const command = briefingActionCommand(action);
    if (!operator || command === undefined || action.commandId === undefined) return null;
    return (
      <JobCommand
        request={{ kind: JOB_KIND_BY_COMMAND[action.commandId] }}
        workspace={workspace}
        lead={`${action.label}:`}
        note={
          command.spendsMoney ? (
            <Badge variant="outline" className="w-fit border-notice-badge-border bg-notice text-warning-soft-foreground">
              Para harcar (Apify)
            </Badge>
          ) : null
        }
      />
    );
  }
  const href = briefingActionHref(action);
  if (href === undefined) return null;
  return (
    <Link href={href} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
      {action.label}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}
