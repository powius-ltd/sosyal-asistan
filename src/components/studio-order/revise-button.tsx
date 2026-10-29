"use client";

import { Loader2, MessageSquareDiff } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { requestOrderRevisionAction } from "@/app/actions/studio-orders";
import { callAction } from "@/components/common/call-action";
import type { JobRunContext } from "@/components/jobs/job-run-types";
import { parseSpendInput, SPEND_RULE, spendInputDefault } from "@/components/jobs/spend-input";
import { useJobRun, type JobRun } from "@/components/jobs/use-job-run";
import { SUGGESTED_PRODUCE_USD } from "@/components/studio-order/produce-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REVISE_COPY } from "@/lib/copy/studio-order-revise";
import { availableApprovalBases } from "@/lib/domain/panel-job";
import { ORDER_REVISION_NOTE_MAX } from "@/lib/domain/studio-order";

export interface ReviseButtonProps {
  /** Panel fişinin kimliği (`studio_orders.id`). */
  orderId: string;
  /** Kalan revize hakkı (1–3); 0 ise düğme hiç çizilmez (çağıran eler). */
  left: number;
  /** Üretimi aynı pencereden başlatabilmek için işler bağlamı; yoksa (işler kapalı, örnek veri, müşteri görünümü) yalnız not kaydedilir. */
  jobContext?: JobRunContext;
}

/**
 * Yayın onay kartındaki "Revize iste" (SPN-36). Not zorunlu (≤ 500); gönderince önce revize kaydedilir (eski yayın iptal, fiş taslak, sürüm +1), sonra
 * işler açıksa AYNI iş yoluyla (`produce`, tek seferlik tutar onayı) yeniden üretim istenir. İşler kapalıysa yalnız not kaydedilir ve ekran bunu söyler.
 * Kural güvenlik sınırı değildir: asıl denetim action ve depodadır.
 */
export function ReviseButton(props: ReviseButtonProps) {
  return props.jobContext ? <WithJobs {...props} jobContext={props.jobContext} /> : <ReviseDialog {...props} />;
}

function WithJobs(props: ReviseButtonProps & { jobContext: JobRunContext }) {
  const run = useJobRun(props.jobContext.seed);
  const spend = props.jobContext.spend;
  const oneTime = spend !== undefined && availableApprovalBases("produce", spend.caps).includes("one_time");
  return <ReviseDialog {...props} run={oneTime ? run : undefined} />;
}

function ReviseDialog({ orderId, left, run }: ReviseButtonProps & { run?: JobRun }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<string>(spendInputDefault(SUGGESTED_PRODUCE_USD));
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const noteId = useId();
  const amountId = useId();
  const produces = run !== undefined;
  const busy = pending || (run?.busy ?? false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (note.trim() === "") return setError(REVISE_COPY.noteRequired);
    let maxUsd = 0;
    if (produces) {
      const parsed = parseSpendInput(amount);
      if (!parsed.ok) return setError(parsed.message);
      maxUsd = parsed.value;
    }
    setError(undefined);
    setPending(true);
    const revised = await callAction(() => requestOrderRevisionAction({ orderId, note }));
    if (!revised.ok) {
      setPending(false);
      return setError(revised.message);
    }
    if (run) {
      const jobId = await run.start({ kind: "produce", orderId, approval: { basis: "one_time", maxUsd } });
      if (jobId !== undefined) toast.success(REVISE_COPY.savedProducing);
      else toast.warning(`${REVISE_COPY.savedProduceFailed}${run.phase.name === "failed" ? ` (${run.phase.message})` : ""}`);
    } else toast.success(REVISE_COPY.savedOnly);
    setPending(false);
    setNote("");
    setOpen(false);
  };

  return (
    <>
      <Button size="sm" variant="outline" className="min-h-tap flex-1 sm:flex-none md:min-h-0" onClick={() => setOpen(true)}>
        <MessageSquareDiff data-icon="inline-start" aria-hidden />
        {REVISE_COPY.button}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{REVISE_COPY.dialogTitle}</DialogTitle>
            <DialogDescription>{REVISE_COPY.dialogLead}</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={noteId}>{REVISE_COPY.noteLabel}</Label>
              <Textarea
                id={noteId}
                value={note}
                maxLength={ORDER_REVISION_NOTE_MAX}
                rows={4}
                placeholder={REVISE_COPY.notePlaceholder}
                onChange={(event) => {
                  setNote(event.target.value);
                  setError(undefined);
                }}
                readOnly={busy}
                aria-invalid={error !== undefined ? true : undefined}
              />
              <p className="text-xs text-muted-foreground">{REVISE_COPY.noteRule}</p>
            </div>
            <p className="text-sm text-muted-foreground">{REVISE_COPY.scope}</p>
            <p className="text-sm text-muted-foreground">{REVISE_COPY.left(left)}</p>
            {produces ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-muted-foreground">{REVISE_COPY.spend}</p>
                <Label htmlFor={amountId}>{REVISE_COPY.amountLabel}</Label>
                <Input id={amountId} inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} readOnly={busy} className="h-11 sm:max-w-40" />
                <p className="text-xs text-muted-foreground">{SPEND_RULE}</p>
              </div>
            ) : (
              <p className="text-sm">{REVISE_COPY.savedOnlyHint}</p>
            )}
            {error !== undefined ? (
              <p role="alert" className="border-l-2 border-destructive pl-3 text-sm">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)} disabled={busy}>
                {REVISE_COPY.cancel}
              </Button>
              <Button type="submit" size="touch" disabled={busy} aria-busy={busy}>
                {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                {produces ? REVISE_COPY.submit : REVISE_COPY.submitSaveOnly}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
