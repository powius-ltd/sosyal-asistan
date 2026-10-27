import type { ReactNode } from "react";

import { MeasuredValue } from "@/components/common/measured-value";
import { JobCreditEstimate } from "@/components/jobs/job-credit-estimate";
import type { JobApproval, JobCredits, JobEstimate } from "@/lib/domain/panel-job";
import type { JobStatusView } from "@/lib/domain/panel-job-view";
import { formatDate, formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Tahmin yokken (fiyat okunamadı) gösterilen sebep. */
export const ESTIMATE_UNKNOWN_REASON = "Fiyat okunamadı.";
const ACTUAL_UNKNOWN_REASON = "Gerçek tutar henüz belli değil.";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground sm:w-28 sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}

/** Onay satırı: USD onayı (varsa) + kredi tavanı (varsa). Yalnız kredi onayı taşıyan işte tutar yazılmaz (USD yetkisi yoktur). */
function approvalText(approval: JobApproval, timeZone: string): string {
  const usd = approval.basis === "monthly_cap" ? "Aylık sınır içinde" : approval.basis === "one_time" ? `Bu iş için en çok ${formatUsd(approval.maxUsd) ?? "—"}` : approval.basis === "onboarding" ? `Başlangıç onayı: en çok ${formatUsd(approval.maxUsd) ?? "—"}` : undefined;
  const credits = approval.maxCredits === undefined ? undefined : `en çok ${formatNumber(approval.maxCredits) ?? "—"} kredi`;
  const basis = [usd, credits].filter((part): part is string => part !== undefined).join(" · ");
  const at = formatDateTime(approval.approvedAt, timeZone);
  return at === undefined ? basis : `${basis} · ${at}`;
}

/** İşin kredi kapanışı: düşülen (yazılamadıysa "düşülecek") + ayrılan. Bilinmeyen tutar 0 diye yazılmaz. */
function creditsText(credits: JobCredits): string {
  const reserved = `ayrılan ${formatNumber(credits.reserved) ?? "—"}`;
  if (credits.charged === undefined) return `${formatNumber(credits.due) ?? "—"} kredi düşülecek (henüz yazılmadı) · ${reserved}`;
  return `${formatNumber(credits.charged) ?? "—"} kredi düşüldü · ${reserved}`;
}

/** Tahmin + dökümü (onay penceresi ve iş ayrıntısı ortak). Tutar bilinmiyorsa tire + sebep (0 yazılmaz). */
export function JobEstimateBlock({ estimate, className }: { estimate: JobEstimate; className?: string }) {
  return (
    <div data-slot="job-estimate" className={cn("flex flex-col gap-1", className)}>
      <span className="font-medium tabular">
        <MeasuredValue value={estimate.usd} format={formatUsd} reason={ESTIMATE_UNKNOWN_REASON} inline />
      </span>
      {estimate.lines.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {estimate.lines.map((line, index) => (
            <li key={index} className="flex justify-between gap-3">
              <span className="min-w-0 break-words">{line.label}</span>
              <span className="shrink-0 tabular">{formatUsd(line.usd) ?? "—"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * İşin YÖNETİCİ ayrıntısı: onay ve tutarlar, istek parametreleri, rapor dosyası, teknik hata, günlük. Yalnız `view.operator` doluysa
 * çizilir; müşteri görünümünde (`toJobStatusView(…, { operator: false })`) alan hiç gelmez, bileşen hiçbir şey çizmez.
 */
export function JobOperatorDetail({ view, timeZone, className }: { view: JobStatusView; timeZone: string; className?: string }) {
  const job = view.operator;
  if (job === undefined) return null;
  const { approval, result, params, error, logTail } = job;
  const spend = result?.spend;
  // Tutar tahmini yalnız tutar ya da döküm varsa çizilir: yalnız birim sayısı taşıyan tahmin (para harcamayan tur önizlemesi) boş
  // "Tahmin — fiyat okunamadı" satırı üretmez; kredi satırı yine çizilir.
  const usdEstimate = result?.estimate !== undefined && (result.estimate.usd !== undefined || result.estimate.lines.length > 0) ? result.estimate : undefined;
  const hasRows = approval !== undefined || result?.estimate !== undefined || spend !== undefined || result?.credits !== undefined || params.limit !== undefined || params.week !== undefined || result?.reportPath !== undefined;
  if (!hasRows && error === undefined && logTail === undefined) return null;
  return (
    <div data-slot="job-operator-detail" className={cn("flex flex-col gap-3 text-sm", className)}>
      {hasRows ? (
        <dl className="flex flex-col gap-2">
          {approval !== undefined ? <Row label="Onay">{approvalText(approval, timeZone)}</Row> : null}
          {usdEstimate !== undefined ? (
            <Row label="Tahmin">
              <JobEstimateBlock estimate={usdEstimate} />
            </Row>
          ) : null}
          {result?.estimate !== undefined ? (
            <Row label="Kredi">
              <JobCreditEstimate kind={view.kind} estimate={result.estimate} />
            </Row>
          ) : null}
          {result?.credits !== undefined ? (
            <Row label="Düşülen kredi">
              <span className="tabular">{creditsText(result.credits)}</span>
            </Row>
          ) : null}
          {spend !== undefined ? (
            <Row label="Harcanan">
              <span className="tabular">
                <MeasuredValue value={spend.actualUsd} format={formatUsd} reason={ACTUAL_UNKNOWN_REASON} inline />
              </span>
              {spend.reservedUsd !== undefined ? <span className="text-xs text-muted-foreground tabular"> · ayrılan {formatUsd(spend.reservedUsd)}</span> : null}
            </Row>
          ) : null}
          {params.limit !== undefined ? <Row label="İstek">Hesap başına {formatNumber(params.limit)} video</Row> : null}
          {params.week !== undefined ? <Row label="Hafta">{formatDate(params.week, "UTC") ?? params.week}</Row> : null}
          {result?.reportPath !== undefined ? (
            <Row label="Rapor">
              <code className="text-xs break-all">{result.reportPath}</code>
            </Row>
          ) : null}
        </dl>
      ) : null}
      {error !== undefined ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Hata</p>
          <pre data-operator="error" className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 text-xs break-words whitespace-pre-wrap text-destructive">
            {error}
          </pre>
        </div>
      ) : null}
      {logTail !== undefined ? (
        <details className="group/log">
          <summary className="w-fit cursor-pointer rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
            Günlük (son satırlar)
          </summary>
          <pre data-operator="log" className="mt-1 max-h-64 overflow-auto rounded-md border bg-muted/40 p-2 text-xs break-words whitespace-pre-wrap">
            {logTail}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
