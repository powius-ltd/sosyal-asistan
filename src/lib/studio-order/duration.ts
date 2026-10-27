/**
 * Hedef süre ÖNERİSİ (bağlayıcı değil; stüdyo yumuşak hedef sayar). Sabit aralık yok; iki kaynaktan beslenir: fikrin dayandığı tutan
 * rakip videoların süresi (öncelik) ve kendi süre gruplarının sonucu. Hiçbiri yoksa fikrin planda yazılı hedef süresi; o da yoksa öneri
 * YOK (`undefined`, uydurma süre yazılmaz). Tek sert sınır platformunki (`schema.ts` MIN/MAX_TARGET_SEC).
 */
import type { LiftGroupStat } from "@/lib/domain/insights";
import { DURATION_BUCKET_LABEL, type DurationBucket } from "@/lib/domain/taxonomy";
import { formatDecimal } from "@/lib/format";
import { MAX_TARGET_SEC, MIN_TARGET_SEC } from "@/lib/studio-order/schema";

export interface DurationSuggestion {
  sec: number;
  reason: string;
}

export interface DurationInput {
  /** Fikrin dayandığı tutan rakip videoların süreleri (sn); süresi bilinmeyen video verilmez. */
  rivalSecs: readonly number[];
  /** Planın fikir için yazdığı hedef süre. */
  ideaTargetSec?: number;
  /** Kendi hesabın süre grupları (`Insights.durationBuckets.own`). */
  ownGroups: readonly LiftGroupStat<DurationBucket>[];
}

/** Süre kovasının temsilî değeri: kovada kendi önerisi olmayan hesap için yalnız son çare. */
const BUCKET_REPRESENTATIVE_SEC: Record<DurationBucket, number> = { under_15: 12, "15_30": 22, "30_60": 45, "60_90": 75, over_90: 100 };
/** Kendi grubun "kanıt" sayılması için en az ölçülmüş video. */
const OWN_GROUP_MIN_SAMPLE = 3;

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const clamp = (sec: number): number => Math.min(MAX_TARGET_SEC, Math.max(MIN_TARGET_SEC, Math.round(sec)));

function bestOwnGroup(groups: readonly LiftGroupStat<DurationBucket>[]): LiftGroupStat<DurationBucket> | undefined {
  let best: LiftGroupStat<DurationBucket> | undefined;
  for (const group of groups) {
    if (group.medianLift === undefined || group.liftN < OWN_GROUP_MIN_SAMPLE) continue;
    if (best === undefined || group.medianLift > (best.medianLift ?? 0)) best = group;
  }
  return best;
}

export function suggestDuration(input: DurationInput): DurationSuggestion | undefined {
  const rivals = input.rivalSecs.filter((sec) => Number.isFinite(sec) && sec > 0);
  const own = bestOwnGroup(input.ownGroups);
  const ownText =
    own === undefined ? undefined : `kendi sonuçlarında en iyi süre grubu ${DURATION_BUCKET_LABEL[own.key]} (medyan ${formatDecimal(own.medianLift ?? 0, 1)} kat, ${own.liftN} video)`;

  const rivalMedian = median(rivals);
  if (rivalMedian !== undefined) {
    const low = Math.round(Math.min(...rivals));
    const high = Math.round(Math.max(...rivals));
    const range = low === high ? `${low} sn` : `${low}–${high} sn`;
    return { sec: clamp(rivalMedian), reason: `tutan rakip videolar ${range} (${rivals.length} video, medyan ${Math.round(rivalMedian)} sn)${ownText ? `; ${ownText}` : ""}` };
  }
  if (input.ideaTargetSec !== undefined && input.ideaTargetSec > 0) {
    return { sec: clamp(input.ideaTargetSec), reason: `planın bu fikir için yazdığı hedef süre; süresi bilinen tutan rakip video yok${ownText ? `; ${ownText}` : ""}` };
  }
  if (own !== undefined) return { sec: BUCKET_REPRESENTATIVE_SEC[own.key], reason: `${ownText}; kovanın ortası alındı` };
  return undefined;
}
