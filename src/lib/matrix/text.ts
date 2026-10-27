/**
 * Yaklaşım haritası metinleri (saf; LLM yok): kutu başlığı ve "denemediğin yaklaşımlar" cümlesi KODDAN üretilir (sayılar hücreden, uydurma
 * yok). Terimler düz dildir (`lib/matrix/plain.ts`). Ölçülemeyen değer "normaline göre ölçülemedi" diye yazılır, asla "0" değil.
 */
import type { CreativeAngle, CreativeMatrixCell, FunnelStage, PriorFit } from "@/lib/domain/creative-matrix";
import { FUNNEL_STAGES } from "@/lib/domain/creative-matrix";
import { formatNumber } from "@/lib/format";
import { angleCellTitle, lowSampleNote, outlierCountPhrase, PRIOR_LEVEL_PLAIN, rivalsVideoPhrase, STAGE_ROW_PLAIN, typicalPhrase } from "@/lib/matrix/plain";

/** Beklenen uyum seviyesi, cümle içinde ("iyi", "orta", "zayıf"). */
export const priorText = (prior: PriorFit): string => PRIOR_LEVEL_PLAIN[prior];

export function stageLabel(stage: FunnelStage): string {
  return STAGE_ROW_PLAIN[stage] ?? FUNNEL_STAGES.find((s) => s.id === stage)?.label ?? stage;
}

/** "Acı / korku yaklaşımı · sorunu bilen izleyici". */
export function cellTitle(cell: { stage: FunnelStage; angle: CreativeAngle }): string {
  return angleCellTitle(cell);
}

/**
 * Tek cümle: "Acı / korku yaklaşımı · sorunu bilen izleyici: rakiplerde 6 video, tipik video normalinin 3,2 katı izlendi, 2 tanesi tutan, sen denemedin;
 * beklenen uyum: iyi". Güven düşükse sayının dayanağı da yazılır (tek videonun 9x'i ile 12 videonun 3x'i aynı cümlede aynı ağırlıkta görünmesin).
 */
export function opportunityText(cell: CreativeMatrixCell): string {
  const { rivals } = cell;
  const parts = [rivalsVideoPhrase(formatNumber(rivals.n) ?? "0"), typicalPhrase(rivals.medianLift)];
  if (rivals.liftN > 0 && rivals.outlierCount > 0) parts.push(outlierCountPhrase(formatNumber(rivals.outlierCount) ?? "0"));
  parts.push(cell.ownTried ? "sen denedin" : "sen denemedin");
  const low = rivals.confidence === "low" ? lowSampleNote(formatNumber(rivals.liftN) ?? "0") : "";
  return `${cellTitle(cell)}: ${parts.join(", ")}; beklenen uyum: ${priorText(cell.prior)}${low}`;
}
