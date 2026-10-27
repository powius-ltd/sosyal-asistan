import { AdSignalBadge } from "@/components/matrix/ad-signal-badge";
import { CellRow } from "@/components/matrix/cell-row";
import type { AdCellStat } from "@/lib/domain/ads";
import { adCellSignalOf } from "@/lib/matrix/ad-signal";
import { AD_CELL_PLAIN, adCountPhrase } from "@/lib/plain-language-ads";

/**
 * Hücrenin reklam satırı görünür mü: reklam hesabı yoksa (`ads` yok) hiç; kreatifsiz hücrede ("denenmedi") yalnız hücrede video varsa
 * (boş hücrelerde 16 tekrar eden rozet gürültü olur; ayrıntıda her zaman yazılıdır).
 */
export function adRowVisible(ads: AdCellStat | undefined, hasVideos: boolean): ads is AdCellStat {
  return ads !== undefined && (ads.creatives > 0 || hasVideos);
}

/** Hücrenin reklam satırı: işaret rozeti + kaç reklam (+ az reklam notu). Hücre durumunu etkilemez. */
export function AdCellRow({ ads }: { ads: AdCellStat }) {
  const count = adCountPhrase(ads.creatives);
  return (
    <CellRow label={AD_CELL_PLAIN.side}>
      <AdSignalBadge signal={adCellSignalOf(ads)} />
      {count !== undefined ? <span className="tabular">{count}</span> : null}
      {ads.creatives > 0 && ads.confidence === "low" ? <span className="text-muted-foreground">{AD_CELL_PLAIN.lowConfidence}</span> : null}
    </CellRow>
  );
}
