import { MeasuredValue } from "@/components/common/measured-value";
import type { ShadowApiCost } from "@/lib/domain/run";
import { formatNumber, formatUsd } from "@/lib/format";

export const SHADOW_COST_UNKNOWN_REASON = "Hiçbir çağrının fiyatı hesaplanamadı (token sayısı kayıtlı değil ya da model fiyat tablosunda yok).";

/** Fiyatı hesaplanamayan çağrıların dökümü: token'sız ve modeli tabloda olmayan AYRI sayılır. */
function gapNote(shadow: ShadowApiCost): string {
  const noTokens = shadow.unpricedRuns - shadow.unlistedRuns;
  return [
    ...(noTokens > 0 ? [`${formatNumber(noTokens)} çağrının token sayısı yok`] : []),
    ...(shadow.unlistedRuns > 0 ? [`${formatNumber(shadow.unlistedRuns)} çağrının modeli fiyat tablosunda yok`] : []),
  ]
    .map((part) => `, ${part}`)
    .join("");
}

/**
 * Abonelik çağrıları API fiyatıyla ne tutardı (yalnız yönetici ekranı; "Aylık maliyet" bölümünde). Gerçek harcama DEĞİL: aboneliğe
 * dahil çağrıların liste fiyatı karşılığıdır, tavana ve toplamlara girmez. Tutar bilinmiyorsa tire + sebep (0 yazılmaz).
 */
export function ShadowCostNote({ shadow, calls }: { shadow: ShadowApiCost; calls: number }) {
  if (calls <= 0) return null;
  return (
    <div data-slot="shadow-cost" className="flex flex-col gap-1 border-t pt-4 text-sm">
      <p>
        <span className="text-muted-foreground">API fiyatıyla tutardı: </span>
        <span className="font-medium tabular">
          <MeasuredValue
            value={shadow.usd}
            format={(usd) => `≈ ${formatUsd(Math.round(usd * 100) / 100)}`}
            reason={SHADOW_COST_UNKNOWN_REASON}
            inline
          />
        </span>
        <span className="text-xs text-muted-foreground tabular">
          {" "}
          ({formatNumber(calls)} çağrı{gapNote(shadow)})
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        Abonelikten harcanan gerçek bir tutar değil. Her çağrı kaydedilen modelin fiyatıyla sayılır; model adı kaydedilmemiş eski çağrılarda
        video incelemesi Gemini 3.8 Flash, yazı işleri Claude Sonnet 5.5 varsayılır. Fiyat tablosu {shadow.priceVersion}.
      </p>
    </div>
  );
}
