"use client";

import { Loader2 } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import { AiPending, type AiPendingStage } from "@/components/common/ai-pending";
import { MeasuredValue } from "@/components/common/measured-value";
import { JobCreditEstimate } from "@/components/jobs/job-credit-estimate";
import { JobEstimateBlock } from "@/components/jobs/job-operator-detail";
import type { JobSpendContext } from "@/components/jobs/job-run-types";
import { parseSpendInput, SPEND_RULE, spendInputDefault } from "@/components/jobs/spend-input";
import type { JobRunPhase } from "@/components/jobs/use-job-run";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAP_NONE_REASON, SPENT_UNKNOWN_REASON } from "@/lib/cost";
import type { JobApprovalInput } from "@/lib/data/queries";
import { JOB_SPEND_MAX_USD, suggestApprovalUsd, type JobApprovalBasis, type JobEstimate, type JobKind } from "@/lib/domain/panel-job";
import { formatUsd } from "@/lib/format";
import { jobOutcomePhrase } from "@/lib/plain-language";

const ESTIMATE_STAGES: readonly AiPendingStage[] = [
  { id: "queue", label: "Sıraya yazıyorum" },
  { id: "estimate", label: "Ne kadar tutacağına bakıyorum" },
];
const NO_ESTIMATE: JobEstimate = { lines: [] };
const UNTRACKED_MESSAGE = "Tahmin işinin sonucunu okuyamadım.";

export interface JobApprovalDialogProps {
  open: boolean;
  /** Onaylanan işin adı ("Hesaba bak"). */
  title: string;
  kind: JobKind;
  /** $0 tahmin işinin evresi (`useJobRun`). */
  estimate: JobRunPhase;
  spend: JobSpendContext;
  /** Kullanılabilir onay biçimleri, öncelik sırasıyla (`availableApprovalBases`); boş olamaz (boşsa pencere hiç açılmaz). */
  bases: readonly JobApprovalBasis[];
  /** Gerçek iş isteniyor. */
  submitting: boolean;
  /** Gerçek iş açılamadıysa sebebi. */
  submitError?: string;
  onApprove: (approval: JobApprovalInput) => void;
  onRetryEstimate: () => void;
  onClose: () => void;
}

/**
 * Harcama onayı penceresi (yalnız yönetici): önce $0 tahmin işi koşar; sonuç gelince tahmin, bu ay harcanan / aylık sınır ve tutar alanı
 * gösterilir. "Onayla ve başlat" gerçek işi onay kaydıyla açar. Boş, 0 ya da `JOB_SPEND_MAX_USD` üstü tutar GÖNDERİLMEZ.
 */
export function JobApprovalDialog({ open, title, onClose, ...body }: JobApprovalDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}: harcama onayı</DialogTitle>
          <DialogDescription>Bu iş para harcar. Önce ne kadar tutacağına bakıyorum; onaylamadan hiçbir şey harcanmaz.</DialogDescription>
        </DialogHeader>
        <ApprovalBody onClose={onClose} {...body} />
      </DialogContent>
    </Dialog>
  );
}

function ApprovalBody({ kind, estimate, spend, bases, submitting, submitError, onApprove, onRetryEstimate, onClose }: Omit<JobApprovalDialogProps, "open" | "title">) {
  if (estimate.name === "requesting" || estimate.name === "waiting" || estimate.name === "idle") {
    return <AiPending stages={ESTIMATE_STAGES} current={estimate.name === "waiting" ? "estimate" : "queue"} onCancel={onClose} />;
  }
  const problem =
    estimate.name === "failed"
      ? estimate.message
      : estimate.name === "untracked"
        ? UNTRACKED_MESSAGE
        : estimate.view.status === "succeeded"
          ? undefined
          : (jobOutcomePhrase(estimate.view) ?? UNTRACKED_MESSAGE);
  if (estimate.name !== "finished" || problem !== undefined) {
    return (
      <>
        <p role="alert" className="border-l-2 border-destructive pl-3 text-sm">
          <span className="font-medium">Tahmin alınamadı: </span>
          {problem}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" size="touch" onClick={onClose}>
            Kapat
          </Button>
          <Button type="button" size="touch" onClick={onRetryEstimate}>
            Tekrar dene
          </Button>
        </DialogFooter>
      </>
    );
  }
  return (
    <ApprovalForm
      kind={kind}
      result={estimate.view.operator?.result?.estimate ?? NO_ESTIMATE}
      note={estimate.view.outcome === undefined ? undefined : jobOutcomePhrase(estimate.view)}
      spend={spend}
      bases={bases}
      submitting={submitting}
      submitError={submitError}
      onApprove={onApprove}
      onClose={onClose}
    />
  );
}

interface ApprovalFormProps extends Pick<JobApprovalDialogProps, "kind" | "spend" | "bases" | "submitting" | "submitError" | "onApprove" | "onClose"> {
  result: JobEstimate;
  /** Tahmin işinin bilinen sonucu (ör. "Sonucu ölçülecek video yok."). */
  note?: string;
}

function ApprovalForm({ kind, result, note, spend, bases, submitting, submitError, onApprove, onClose }: ApprovalFormProps) {
  const [basis, setBasis] = useState<JobApprovalBasis>(bases[0] ?? "one_time");
  const suggested = spendInputDefault(suggestApprovalUsd(result.usd));
  const [typed, setTyped] = useState<string>();
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const amountId = useId();
  const helpId = useId();
  const errorId = useId();
  const amount = typed ?? suggested;
  // Ölçümün kendi aylık sınırı vardır (genel aylık sınırdan ayrı): adı ayrı yazılır ki iki tutar karışmasın.
  const monthlyCap = kind === "measure" ? spend.caps.measureMonthlyCapUsd : spend.caps.apifyMonthlyCapUsd;
  const monthlyCapName = kind === "measure" ? "aylık ölçüm sınırının" : "aylık sınırın";
  // Tahmin tek seferde onaylanabilecek en yüksek tutarı aşıyorsa tutar onayıyla başlatılamaz (işçi tahmini aşan onayla hiç başlamaz).
  const overMax = basis === "one_time" && result.usd !== undefined && result.usd > JOB_SPEND_MAX_USD;
  const parsed = parseSpendInput(amount);
  const belowEstimate = basis === "one_time" && parsed.ok && result.usd !== undefined && parsed.value < result.usd;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting || overMax) return;
    if (basis === "monthly_cap") {
      onApprove({ basis: "monthly_cap" });
      return;
    }
    if (!parsed.ok) {
      setError(parsed.message);
      inputRef.current?.focus();
      return;
    }
    setError(undefined);
    onApprove({ basis: "one_time", maxUsd: parsed.value });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      {note !== undefined ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      <dl className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Tahmini tutar</dt>
          <dd>
            <JobEstimateBlock estimate={result} />
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Tahmini kredi</dt>
          <dd>
            <JobCreditEstimate kind={kind} estimate={result} />
          </dd>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Bu ay harcanan</dt>
            <dd className="tabular">
              <MeasuredValue value={spend.month.spentUsd} format={formatUsd} reason={SPENT_UNKNOWN_REASON} inline />
              {spend.month.reservedUsd > 0 ? <span className="block text-xs text-muted-foreground">ayrılan {formatUsd(spend.month.reservedUsd)}</span> : null}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Aylık sınır</dt>
            <dd className="tabular">
              <MeasuredValue value={spend.month.capUsd} format={formatUsd} reason={CAP_NONE_REASON} inline />
            </dd>
          </div>
        </div>
      </dl>

      {bases.length > 1 ? (
        <fieldset className="flex flex-col gap-2 text-sm" disabled={submitting}>
          <legend className="mb-1 text-xs text-muted-foreground">Nasıl onaylıyorsun?</legend>
          {bases.map((option) => (
            <label key={option} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 has-checked:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
              <input type="radio" name="basis" value={option} checked={basis === option} onChange={() => setBasis(option)} className="size-4 accent-primary outline-none" />
              <span>{option === "monthly_cap" ? `Onaylı ${monthlyCapName} içinde (${formatUsd(monthlyCap) ?? "—"})` : "Bu iş için ayrı tutar"}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {basis === "one_time" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={amountId}>En çok harcanacak tutar (USD)</Label>
          <Input
            ref={inputRef}
            id={amountId}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Örn. 0,15"
            value={amount}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(undefined);
            }}
            readOnly={submitting}
            aria-invalid={error !== undefined}
            aria-describedby={error !== undefined ? `${errorId} ${helpId}` : helpId}
            className="h-11 sm:max-w-40"
          />
          {error !== undefined ? (
            <p id={errorId} className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <p id={helpId} className="text-xs text-muted-foreground">
            {SPEND_RULE} Tahmin bu tutarı aşarsa iş hiç başlamaz.
          </p>
          {overMax ? (
            <p role="alert" className="text-sm text-destructive">
              Tahmin, tek seferde onaylanabilecek en yüksek tutarı ({formatUsd(JOB_SPEND_MAX_USD)}) aşıyor; bu iş buradan başlatılamaz.
            </p>
          ) : belowEstimate ? (
            <p className="text-sm text-warning-strong">Bu tutar tahminin altında: iş başlamadan durur.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Onaylı {monthlyCapName} içinde çalışır; ayrıca tutar girmen gerekmez.</p>
      )}

      {submitError !== undefined ? (
        <p role="alert" className="border-l-2 border-destructive pl-3 text-sm">
          <span className="font-medium">Olmadı: </span>
          {submitError}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" size="touch" onClick={onClose} disabled={submitting}>
          Vazgeç
        </Button>
        <Button type="submit" size="touch" disabled={submitting || overMax} aria-busy={submitting}>
          {submitting ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          Onayla ve başlat
        </Button>
      </DialogFooter>
    </form>
  );
}
