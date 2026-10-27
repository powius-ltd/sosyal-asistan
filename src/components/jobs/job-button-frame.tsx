"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useId, type ReactNode } from "react";

import type { JobRun, JobRunPhase } from "@/components/jobs/use-job-run";
import { Button } from "@/components/ui/button";
import type { JobStatus } from "@/lib/domain/panel-job";
import { jobOutcomePhrase, jobStripPhrase } from "@/lib/plain-language";
import { cn } from "@/lib/utils";

/** Çalışma alanında başka bir iş sürerken düğmenin altındaki not. */
export const JOB_BLOCKED_NOTE = "Şu an başka bir iş sürüyor; bitince başlatabilirsin.";
const QUEUED_NOTE = "Sıraya yazdım.";
const UNTRACKED_NOTE = "İşi sıraya yazdım.";

const RESULT_TONE: Record<JobStatus, string> = {
  queued: "text-muted-foreground",
  running: "text-muted-foreground",
  succeeded: "text-success",
  partial: "text-warning-strong",
  blocked: "text-warning-strong",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
};

/** Evrenin düz dil cümlesi (sözlükten) ve rengi; söylenecek bir şey yoksa undefined. İş açılamadıysa (failed) ayrı uyarı kutusu çizilir. */
function statusLine(phase: JobRunPhase): { text: string; tone: string } | undefined {
  switch (phase.name) {
    case "waiting":
      return { text: (phase.view && jobStripPhrase(phase.view)) ?? QUEUED_NOTE, tone: "text-muted-foreground" };
    case "finished": {
      const text = jobOutcomePhrase(phase.view);
      return text === undefined ? undefined : { text, tone: RESULT_TONE[phase.view.status] };
    }
    case "untracked":
      return { text: UNTRACKED_NOTE, tone: "text-muted-foreground" };
    default:
      return undefined;
  }
}

/**
 * Düğmenin altındaki geri bildirim: beklerken "şimdi yaptığım" cümlesi, bitince sonuç cümlesi, iş açılamadıysa sebep + "Tekrar dene".
 * Canlı bölge hep DOM'dadır (ekran okuyucu değişikliği duyar).
 */
export function JobRunFeedback({ phase, onRetry, retryDisabled = false }: { phase: JobRunPhase; onRetry?: () => void; retryDisabled?: boolean }) {
  const line = statusLine(phase);
  return (
    <>
      <p role="status" data-slot="job-feedback" data-phase={phase.name} className={line ? cn("text-sm", line.tone) : "sr-only"}>
        {line?.text ?? ""}
      </p>
      {phase.name === "failed" ? (
        <div role="alert" className="flex flex-col gap-2 border-l-2 border-destructive pl-3 text-sm">
          <p>
            <span className="font-medium">Olmadı: </span>
            {phase.message}
          </p>
          {onRetry ? (
            <Button type="button" variant="outline" size="touch" className="w-full sm:w-fit" disabled={retryDisabled} onClick={onRetry}>
              <RotateCcw aria-hidden />
              Tekrar dene
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export interface JobButtonLook {
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "touch";
  /** Kapsayıcının sınıfı (genişlik, hizalama). */
  className?: string;
  /** Başka iş sürerken "başka bir iş sürüyor" notu görünür yazılmasın (not aynı ekranda zaten varsa); ekran okuyucu yine duyar. */
  quietWhenBlocked?: boolean;
}

interface JobButtonFrameProps extends JobButtonLook {
  label: string;
  run: JobRun;
  onPress: () => void;
  onRetry: () => void;
  /** Verilirse düğme kapalı çizilir ve nedeni altına yazılır (ör. harcama kapalı). */
  closedNote?: ReactNode;
}

/** İş düğmesinin ortak çerçevesi: düğme (bekleme düğmenin üstünde görünür) + kapalıysa nedeni + geri bildirim. */
export function JobButtonFrame({ label, run, onPress, onRetry, closedNote, variant = "outline", size = "touch", className, quietWhenBlocked = false }: JobButtonFrameProps) {
  const noteId = useId();
  const closed = closedNote !== undefined && closedNote !== null && closedNote !== false;
  const blocked = run.blocked && !run.busy;
  const note = closed ? closedNote : blocked ? JOB_BLOCKED_NOTE : undefined;
  return (
    <div data-slot="job-action" className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        className="w-full sm:w-fit"
        disabled={run.busy || blocked || closed}
        aria-busy={run.busy}
        aria-describedby={note === undefined ? undefined : noteId}
        onClick={onPress}
      >
        {run.busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
        {label}
      </Button>
      {note === undefined ? null : (
        <p id={noteId} data-slot="job-note" className={!closed && quietWhenBlocked ? "sr-only" : "text-xs text-muted-foreground"}>
          {note}
        </p>
      )}
      <JobRunFeedback phase={run.phase} onRetry={onRetry} retryDisabled={run.busy || blocked} />
    </div>
  );
}
