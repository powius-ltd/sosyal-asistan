import type { ReactNode } from "react";

import { CopyButton } from "@/components/ideas/copy-button";
import { JobAction } from "@/components/jobs/job-action";
import type { JobRequest } from "@/components/jobs/job-run-types";
import type { JobButtonOptions } from "@/components/jobs/run-job-button";
import { getPanelContext } from "@/lib/data";
import { jobScript } from "@/lib/domain/panel-job";
import { workspaceCommand, type WorkspaceCommandRef } from "@/lib/workspace/command";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

interface JobCommandFallbackProps {
  request: JobRequest;
  /** Yedek komutun çalışma alanı (slug'ı bilen çağıran verir); verilmezse istekteki çalışma alanının kimliğiyle kurulur. */
  workspace?: WorkspaceCommandRef;
  /** Yedek komutun önündeki kısa yönetici metni ("yenilemek için"). */
  lead?: ReactNode;
  /** Yedek komuta eklenecek, isteğin taşımadığı betik bayrakları (ör. `--apify-max=0.5`). */
  flags?: string;
  /** Yedek komutun altına gelen yönetici notu (ör. "Para harcar" uyarısı). */
  note?: ReactNode;
}

export interface JobCommandProps extends JobButtonOptions, Omit<JobCommandFallbackProps, "request"> {
  /** `false`: işler kapalıyken hiçbir şey çizilmez (aynı işi kapsayan komut komşu düğmenin yedeğinde zaten yazıyorsa). */
  command?: boolean;
}

/**
 * İsteğin terminal karşılığı: `npm run <betik> -- --workspace=<slug|kimlik>` + isteğin bayrakları (`--dry-run`, `--week=`, `--limit=`) +
 * ek bayraklar. Komut çalışma alanını HER ZAMAN taşır (bayraksız komut varsayılan çalışma alanında çalışırdı).
 */
export function jobCommandText(request: JobRequest, workspace: WorkspaceCommandRef, flags?: string): string | undefined {
  // Terminal betiği olmayan iş (başlangıç akışı) için yedek komut metni yoktur.
  const script = jobScript(request.kind);
  if (script === undefined) return undefined;
  const parts = [workspaceCommand(script, workspace)];
  if ("dryRun" in request && request.dryRun === true) parts.push("--dry-run");
  if ("week" in request && request.week !== undefined) parts.push(`--week=${request.week}`);
  if ("limit" in request && request.limit !== undefined) parts.push(`--limit=${request.limit}`);
  if (flags) parts.push(flags);
  return parts.join(" ");
}

/**
 * Yedek: işler bu istekte panelden başlatılamıyorsa (örnek veri, işçi yok) eski komut metni; YALNIZ yönetici modunda. Müşteri görünümünde
 * hiçbir şey çizilmez (ne düğme ne komut).
 */
async function JobCommandFallback({ request, workspace, lead = "Yönetici:", flags, note }: JobCommandFallbackProps) {
  if (!isOperatorMode()) return null;
  const text = jobCommandText(request, workspace ?? { id: (await getPanelContext()).wsId }, flags);
  if (text === undefined) return null;
  return (
    <div data-slot="job-command-fallback" className="flex min-w-0 flex-col gap-1.5 text-xs text-muted-foreground">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <span>{lead}</span>
        <code className="max-w-full rounded bg-muted px-1.5 py-0.5 font-mono break-all">{text}</code>
        <CopyButton text={text} label={`Komutu kopyala: ${text}`} />
      </div>
      {note}
    </div>
  );
}

/**
 * "Komut metni → iş düğmesi" sarmalayıcısı (TEK yer): eskiden terminal komutu yazan her ekran bunu kullanır.
 *
 *   <JobCommand request={{ kind: "plan" }} />
 *   <JobCommand request={{ kind: "routine", dryRun: true }} workspace={ref} lead="Terminalde:" />
 *
 * İşler başlatılabiliyorsa (yönetici modu + ortam uygun; kapı `JobAction`'da) düğme çizilir ve komut metni HİÇ görünmez. İşler kapalıysa
 * yönetici modunda komut metni yedek kalır; müşteri görünümünde ikisi de yoktur. Sunucu bileşenidir (içinde async `JobAction` var):
 * istemci bileşeninin içinde çizilemez; eşzamanlı çizen testler `job-command-stub.tsx`'i bağlar.
 */
export function JobCommand({ workspace, lead, flags, note, command = true, ...button }: JobCommandProps) {
  return (
    <JobAction
      {...button}
      fallback={command ? <JobCommandFallback request={button.request} workspace={workspace} lead={lead} flags={flags} note={note} /> : null}
    />
  );
}
