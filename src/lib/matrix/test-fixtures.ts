/** Yalnız testler için: en az alanla matris girdisi (mock depoya bağımlı olmadan). Video/analiz üretimi anatomi fixture'ını kullanır. */
import { NOW, OWN, RIVAL, video, type VideoSpec } from "@/lib/anatomy/test-fixtures";
import type { ContentItem } from "@/lib/domain/content";
import type { ContentCreativeLabel, CreativeAngle, FunnelStage } from "@/lib/domain/creative-matrix";
import type { AnalysisRef } from "@/lib/insights/types";
import type { CreativeMatrixInput } from "@/lib/matrix/build";

export type Slot = readonly [FunnelStage, CreativeAngle];

/** Varsayılan hücre: Sorunu biliyor × Acı / korku. */
export const SLOT: Slot = ["sorunu-biliyor", "aci-korku"];

export interface Made extends VideoSpec {
  /** [katman, açı]; verilmezse etiket yok. */
  cell?: Slot;
  hookType?: string;
  /** false → etiket kanıtı doğrulanmamış. */
  labelVerified?: boolean;
}

export function matrixInput(specs: Made[], over: Partial<CreativeMatrixInput> = {}): CreativeMatrixInput {
  const items: ContentItem[] = [];
  const analyses: AnalysisRef[] = [];
  const labels: ContentCreativeLabel[] = [];
  for (const spec of specs) {
    const { item, analysis } = video(spec);
    items.push(item);
    if (analysis) analyses.push({ contentItemId: item.id, status: analysis.status, evidenceVerified: analysis.evidenceVerified, hookType: spec.hookType });
    if (spec.cell) {
      labels.push({
        contentItemId: item.id,
        funnelStage: spec.cell[0],
        angle: spec.cell[1],
        angleEvidence: "alıntı",
        funnelEvidence: "alıntı",
        evidenceVerified: spec.labelVerified ?? true,
        promptVersion: "p1",
        labeledAt: "2026-09-30T11:00:00.000Z",
      });
    }
  }
  return { workspaceId: "w", own: [OWN], competitors: [RIVAL], items, analyses, labels, now: NOW, ...over };
}

/** `count` rakip videosu, hepsi aynı hücrede ve aynı lift'te (lift `undefined` = ölçülemedi). */
export const rivals = (count: number, lift: number | undefined, cell: Slot = SLOT, extra: Partial<Made> = {}): Made[] =>
  Array.from({ length: count }, (_, i) => ({ id: `r-${cell.join("-")}-${i}-${lift}`, lift, cell, ...extra }));
