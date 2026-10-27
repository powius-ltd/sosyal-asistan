import { MeasuredValue } from "@/components/common/measured-value";
import { estimateJobCredits } from "@/lib/domain/credit-pricing";
import type { JobEstimate, JobKind } from "@/lib/domain/panel-job";
import { CREDIT_ITEM_PLAIN, CREDIT_NOTE_PLAIN, CREDIT_UNKNOWN_PLAIN, creditAmountPhrase, creditLinePhrase } from "@/lib/plain-language";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "Bu iş ≈ X kredi" (YALNIZ yönetici ekranlarında: onay penceresi ve iş ayrıntısı). Kredi, tahminin işlenecek birim sayılarından
 * (`estimate.units`) saf fonksiyonla hesaplanır (`estimateJobCredits`); birim sayısı belli değilse tutar yerine tire + sebep çıkar (0 yazılmaz).
 * Bilgi amaçlıdır: kredi düşülmez, iş engellenmez.
 */
export function JobCreditEstimate({ kind, estimate, className }: { kind: JobKind; estimate: JobEstimate | undefined; className?: string }) {
  const credits = estimateJobCredits(kind, estimate?.units);
  return (
    <div data-slot="job-credit-estimate" className={cn("flex flex-col gap-1", className)}>
      <span className="font-medium tabular">
        <MeasuredValue value={credits?.maxCredits} format={creditAmountPhrase} reason={CREDIT_UNKNOWN_PLAIN} inline />
      </span>
      {credits !== undefined && credits.lines.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {credits.lines.map((line) => (
            <li key={line.item} className="flex justify-between gap-3">
              <span className="min-w-0 break-words">
                {CREDIT_ITEM_PLAIN[line.item].label} · {creditLinePhrase(line)}
              </span>
              <span className="shrink-0 tabular">{formatNumber(line.credits)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {credits !== undefined ? <p className="text-xs text-muted-foreground">{CREDIT_NOTE_PLAIN}</p> : null}
    </div>
  );
}
