"use client";

import { Loader2 } from "lucide-react";
import { useId, useRef, useState } from "react";

import { requestRoutineForAllAction } from "@/app/actions/jobs";
import { callAction } from "@/components/common/call-action";
import { MeasuredValue } from "@/components/common/measured-value";
import { JobButtonFrame } from "@/components/jobs/job-button-frame";
import { JOB_PREVIEW_LABEL } from "@/components/jobs/job-format";
import type { JobRunContext } from "@/components/jobs/job-run-types";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import { parseSpendInput, SPEND_RULE, spendInputDefault } from "@/components/jobs/spend-input";
import { JOB_START_FAILED_MESSAGE, useJobRun } from "@/components/jobs/use-job-run";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAP_NONE_REASON, SPENT_UNKNOWN_REASON } from "@/lib/cost";
import type { JobApprovalInput } from "@/lib/data/queries";
import { availableApprovalBases, suggestApprovalUsd } from "@/lib/domain/panel-job";
import { formatUsd } from "@/lib/format";
import { routineForAllSummary } from "@/lib/job-control/messages";

interface RoutineStarterProps {
  context: JobRunContext;
  /** Yönetilen çalışma alanı sayısı; 1'den fazlaysa "Tüm hesaplar için başlat" çizilir. */
  workspaceCount: number;
  /** Son ön bakıştaki toplama tahmini (USD); tutar alanının ön değeri bundan önerilir. Bilinmiyorsa alan boş başlar. */
  collectEstimateUsd?: number;
}

/** `done.partial`: bazı hesaplarda tur açılamadı (özet bunu söyler; uyarı olarak çizilir). */
type AllState = { name: "idle" } | { name: "requesting" } | { name: "done"; message: string; partial: boolean } | { name: "failed"; message: string };

/**
 * Haftalık turun başlatıcısı: "Önce bak" ($0 ön bakış) · "Başlat" · isteğe bağlı "yeni veri de topla" (tutar onayı) · birden çok hesap
 * varsa "Tüm hesaplar için başlat". Toplama işaretlenmezse tur para harcamaz (toplama adımı onay bekler, gerisi yapılır). İşaretlenirse
 * tutar zorunludur: boş, 0 ya da sınır üstü tutarla iş GÖNDERİLMEZ; düğme "Onayla ve başlat" olur.
 */
export function RoutineStarter({ context, workspaceCount, collectEstimateUsd }: RoutineStarterProps) {
  const run = useJobRun(context.seed);
  const preview = useJobRun(context.seed);
  const [collect, setCollect] = useState(false);
  const [typed, setTyped] = useState<string>();
  const [error, setError] = useState<string>();
  const [all, setAll] = useState<AllState>({ name: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const checkId = useId();
  const amountId = useId();
  const helpId = useId();
  const errorId = useId();

  const spend = context.spend;
  const canCollect = spend !== undefined && availableApprovalBases("routine", spend.caps).length > 0;
  const amount = typed ?? spendInputDefault(suggestApprovalUsd(collectEstimateUsd));
  const withCollect = collect && canCollect;
  const busy = run.busy || preview.busy || all.name === "requesting";
  const blocked = run.blocked || preview.blocked;

  /** Onay girdisi: toplama işaretli değilse onaysız; işaretliyse geçerli tutar şart (geçersizse `false`: iş gönderilmez). */
  const approval = (): { approval?: JobApprovalInput } | false => {
    if (!withCollect) return {};
    const parsed = parseSpendInput(amount);
    if (!parsed.ok) {
      setError(parsed.message);
      inputRef.current?.focus();
      return false;
    }
    setError(undefined);
    return { approval: { basis: "one_time", maxUsd: parsed.value } };
  };

  const start = () => {
    const input = approval();
    if (input !== false) void run.start({ kind: "routine", ...input });
  };

  const startAll = async () => {
    const input = approval();
    if (input === false) return;
    setAll({ name: "requesting" });
    const result = await callAction(() => requestRoutineForAllAction(input), JOB_START_FAILED_MESSAGE);
    if (!result.ok) {
      setAll({ name: "failed", message: result.message });
      return;
    }
    if (result.jobId !== undefined) jobStatusStore.follow(result.jobId);
    setAll({ name: "done", message: routineForAllSummary(result, result.failureReason), partial: result.failed > 0 });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <Checkbox id={checkId} checked={withCollect} disabled={!canCollect || busy} onCheckedChange={(checked) => setCollect(checked === true)} className="mt-0.5" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label htmlFor={checkId} className="leading-snug">
              Yeni veri de topla (para harcar)
            </Label>
            <p className="text-xs text-muted-foreground">
              {canCollect
                ? "İşaretlemezsen tur para harcamaz: elindeki veriyle çalışır."
                : spend === undefined
                  ? "Harcama bilgisini okuyamadım; bu turda yeni veri toplanamaz."
                  : "Yeni veri toplama şu an kapalı (aylık sınır 0)."}
            </p>
          </div>
        </div>
        {withCollect && spend !== undefined ? (
          <div className="flex flex-col gap-1.5 pl-6">
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
              readOnly={busy}
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
              {SPEND_RULE} Tahmin bu tutarı aşarsa veri toplanmaz; diğer adımlar yine yapılır.
              {workspaceCount > 1 ? " Tüm hesaplar için başlatırsan tutar hesap başına geçerlidir." : ""}
            </p>
            <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular">
              <span>
                Bu ay harcanan: <MeasuredValue value={spend.month.spentUsd} format={formatUsd} reason={SPENT_UNKNOWN_REASON} inline />
              </span>
              <span>
                Aylık sınır: <MeasuredValue value={spend.month.capUsd} format={formatUsd} reason={CAP_NONE_REASON} inline />
              </span>
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
        <JobButtonFrame label={JOB_PREVIEW_LABEL} run={preview} quietWhenBlocked onPress={() => void preview.start({ kind: "routine", dryRun: true })} onRetry={() => void preview.start({ kind: "routine", dryRun: true })} />
        <JobButtonFrame label={withCollect ? "Onayla ve başlat" : "Başlat"} variant="default" run={run} quietWhenBlocked onPress={start} onRetry={start} />
        {workspaceCount > 1 ? (
          <div data-slot="job-action" className="flex min-w-0 flex-col gap-1.5">
            <Button type="button" variant="outline" size="touch" className="w-full sm:w-fit" disabled={busy || blocked} aria-busy={all.name === "requesting"} onClick={() => void startAll()}>
              {all.name === "requesting" ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {withCollect ? "Tüm hesaplar için onayla ve başlat" : "Tüm hesaplar için başlat"}
            </Button>
            <p role="status" className={all.name === "done" && !all.partial ? "text-sm text-muted-foreground" : "sr-only"}>
              {all.name === "done" && !all.partial ? all.message : ""}
            </p>
            {all.name === "done" && all.partial ? (
              <p role="alert" data-slot="job-all-partial" className="border-l-2 border-warning-solid pl-3 text-sm text-warning-strong">
                {all.message}
              </p>
            ) : null}
            {all.name === "failed" ? (
              <p role="alert" className="border-l-2 border-destructive pl-3 text-sm">
                <span className="font-medium">Olmadı: </span>
                {all.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
