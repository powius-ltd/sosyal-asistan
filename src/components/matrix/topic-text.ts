/**
 * Konu ve açılış haritası metinleri (saf; LLM yok): kutu başlığı ve "en iyi videoların" / "denemediğin açılışlar" cümleleri KODDAN üretilir
 * (sayılar hücreden). Düz dil (`lib/matrix/plain.ts`, `lib/plain-language-results.ts`). Ölçülemeyen değer "normaline göre ölçülemedi" diye
 * yazılır, asla "0" değil.
 */
import type { TopicHookCell, TopicHookMatrix } from "@/lib/domain/topic-hook-matrix";
import { formatNumber } from "@/lib/format";
import { lowSampleNote, outlierCountPhrase, rivalsVideoPhrase, typicalPhrase } from "@/lib/matrix/plain";
import { openingTypeLabel } from "@/lib/plain-language-results";

/** Satırın Türkçe adı (konu grubu etiketi); matriste yoksa anahtar. */
export function topicLabel(matrix: Pick<TopicHookMatrix, "rows">, clusterKey: string): string {
  return matrix.rows.find((row) => row.key === clusterKey)?.label ?? clusterKey;
}

/** "Sabah rutini · açılış: Soru". */
export function topicCellTitle(label: string, hookType: string): string {
  return `${label} · açılış: ${openingTypeLabel(hookType)}`;
}

/** Kendi tutanın cümlesi: "Sabah rutini · açılış: Soru: 4 videon, tipik video normalinin 2,1 katı izlendi, 2 tanesi tutan". */
export function winnerText(label: string, cell: TopicHookCell): string {
  const { own } = cell;
  const parts = [`${formatNumber(own.n)} videon`, typicalPhrase(own.medianLift)];
  if (own.liftN > 0 && own.outlierCount > 0) parts.push(outlierCountPhrase(formatNumber(own.outlierCount) ?? "0"));
  const low = own.confidence === "low" ? lowSampleNote(formatNumber(own.liftN) ?? "0") : "";
  return `${topicCellTitle(label, cell.hookType)}: ${parts.join(", ")}${low}`;
}

/** Fırsat cümlesi: "Uyku ve enerji · açılış: Liste: rakiplerde 3 video, tipik video normalinin 2,4 katı izlendi, 2 tanesi tutan, sen denemedin". */
export function topicOpportunityText(label: string, cell: TopicHookCell): string {
  const { rivals } = cell;
  const parts = [rivalsVideoPhrase(formatNumber(rivals.n) ?? "0"), typicalPhrase(rivals.medianLift)];
  if (rivals.liftN > 0 && rivals.outlierCount > 0) parts.push(outlierCountPhrase(formatNumber(rivals.outlierCount) ?? "0"));
  parts.push("sen denemedin");
  const low = rivals.confidence === "low" ? lowSampleNote(formatNumber(rivals.liftN) ?? "0") : "";
  return `${topicCellTitle(label, cell.hookType)}: ${parts.join(", ")}${low}`;
}
