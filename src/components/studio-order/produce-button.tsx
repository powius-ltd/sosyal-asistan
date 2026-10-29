"use client";

import { Loader2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { JobButtonFrame } from "@/components/jobs/job-button-frame";
import type { JobRunContext } from "@/components/jobs/job-run-types";
import { parseSpendInput, SPEND_RULE, spendInputDefault } from "@/components/jobs/spend-input";
import { useJobRun } from "@/components/jobs/use-job-run";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRODUCE_COPY } from "@/lib/copy/studio-order";
import { availableApprovalBases } from "@/lib/domain/panel-job";

/** Önerilen üretim tavanı (USD): bir videonun sesi bunun çok altında kalır; fazlası işi durdurur. */
export const SUGGESTED_PRODUCE_USD = 0.5;

/**
 * Fişteki "Üretime gönder" düğmesi (istemci yaprağı; yalnız işler açıkken çizilir: `ProduceAction`). Basınca iş BAŞLAMAZ: kapsam + tutar
 * penceresi açılır; "Onayla ve üret" `produce` işini tek seferlik tutar onayıyla sıraya yazar. Gönderilebilirlik denetimi sunucuda
 * (`produceRequestProblem`) ve işçide yinelenir: bu bileşen güvenlik sınırı değildir.
 */
export function ProduceButton({ orderId, context }: { orderId: string; context: JobRunContext }) {
  const run = useJobRun(context.seed);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState<string>();
  const [error, setError] = useState<string>();
  const amountId = useId();
  const spend = context.spend;
  const oneTime = spend !== undefined && availableApprovalBases("produce", spend.caps).includes("one_time");
  const amount = typed ?? spendInputDefault(SUGGESTED_PRODUCE_USD);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (run.busy) return;
    const parsed = parseSpendInput(amount);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(undefined);
    const jobId = await run.start({ kind: "produce", orderId, approval: { basis: "one_time", maxUsd: parsed.value } });
    if (jobId !== undefined) setOpen(false);
  };

  return (
    <>
      <JobButtonFrame
        label={PRODUCE_COPY.button}
        variant="default"
        run={run}
        onPress={() => setOpen(true)}
        onRetry={() => setOpen(true)}
        closedNote={oneTime ? undefined : PRODUCE_COPY.closedSpend}
      />
      {oneTime ? (
        <Dialog open={open} onOpenChange={(next) => !run.busy && setOpen(next)}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{PRODUCE_COPY.dialogTitle}</DialogTitle>
              <DialogDescription>{PRODUCE_COPY.dialogLead}</DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
              <p className="text-sm">{PRODUCE_COPY.scope}</p>
              <p className="text-sm text-muted-foreground">{PRODUCE_COPY.spend}</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={amountId}>{PRODUCE_COPY.amountLabel}</Label>
                <Input
                  id={amountId}
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => {
                    setTyped(event.target.value);
                    setError(undefined);
                  }}
                  readOnly={run.busy}
                  aria-invalid={error !== undefined}
                  className="h-11 sm:max-w-40"
                />
                {error !== undefined ? <p className="text-sm text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">{SPEND_RULE}</p>}
              </div>
              {run.phase.name === "failed" ? (
                <p role="alert" className="border-l-2 border-destructive pl-3 text-sm">
                  <span className="font-medium">Olmadı: </span>
                  {run.phase.message}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)} disabled={run.busy}>
                  {PRODUCE_COPY.cancel}
                </Button>
                <Button type="submit" size="touch" disabled={run.busy} aria-busy={run.busy}>
                  {run.busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                  {PRODUCE_COPY.approve}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
