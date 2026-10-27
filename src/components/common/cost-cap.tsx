import { Hint } from "@/components/common/hint";
import { MeasuredValue } from "@/components/common/measured-value";
import { Progress } from "@/components/ui/progress";
import { CAP_CLOSED_LABEL, CAP_CLOSED_NOTE, CAP_NONE_REASON, type CostView } from "@/lib/cost";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Tavan değeri (genel bakış maliyet kartı ve Ayarlar sayacı ortak): tanımsız → "—" + sebep; 0 → "Harcama
 * kapalı" (yeni koşu başlamaz); pozitif → tutar. Üç durumun gösterimi tek yerde durur.
 */
export function CapValue({ view }: { view: CostView }) {
  if (view.capState === "closed") {
    return (
      <Hint content={CAP_CLOSED_NOTE} label={`${CAP_CLOSED_LABEL}: ${CAP_CLOSED_NOTE}`}>
        <span data-state="cap-closed">{CAP_CLOSED_LABEL}</span>
      </Hint>
    );
  }
  return <MeasuredValue value={view.capUsd} format={formatUsd} reason={CAP_NONE_REASON} />;
}

/** Tavan kullanım çubuğu: yalnız pozitif tavanda çizilir; ≥%80 amber, ≥%100 kırmızı. */
export function CapProgress({ view, label, className }: { view: CostView; label: string; className?: string }) {
  if (view.ratio === undefined) return null;
  return (
    <Progress
      value={Math.min(view.ratio * 100, 100)}
      aria-label={label}
      className={cn(
        className,
        view.level === "over" && "**:data-[slot=progress-indicator]:bg-destructive",
        view.level === "warn" && "**:data-[slot=progress-indicator]:bg-warning-solid",
      )}
    />
  );
}
