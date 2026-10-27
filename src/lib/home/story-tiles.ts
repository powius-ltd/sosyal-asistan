/**
 * Cümleli rakam karoları (üç adet): Demirkazık'ın ağzından tam cümle + tek büyük rakam. Rakam ölçülemiyorsa karo "ölçülmedi" halidir
 * (tire + sebep; 0 YAZILMAZ). Saf, LLM yok: sayılar plandan ve sonuç okumasından gelir. Kural: `undefined ≠ 0`.
 *  1. Bulunan fikir sayısı: planın maddeleri + yedekleri ("Planda 3, yedekte 3": sayıya ek getirilmez); plan yoksa bekleyen yeni fikirler.
 *  2. Planın en güçlü yönü: "bu tür videolar normalin X katı izleniyor" (kaç videoya bakıldığıyla).
 *  3. Yayınlanan videoların sonucu (sonuç geldiyse sayı, yoksa "henüz ölçülmedi" + ne zaman ölçüleceği).
 */
import { CTA_TYPES, type CtaType } from "@/lib/domain/taxonomy";
import type { FocusDirection, WeeklyPlan } from "@/lib/domain/weekly-plan";
import { formatDecimal, formatNumber } from "@/lib/format";
import type { PlanItemStatus } from "@/lib/overview/plan-item-status";
import { CTA_TYPE_PLAIN } from "@/lib/plain-language";

export type StoryTileKind = "found" | "times" | "result";

export interface StoryTile {
  kind: StoryTileKind;
  /** Büyük rakam ("6", "2,8"); ölçülemediyse undefined (ekran tire çizer). */
  figure?: string;
  /** Rakamın altındaki birim ("katı"). */
  unit?: string;
  /** Maskot'un cümlesi. */
  sentence: string;
  /** Cümlenin altındaki küçük açıklama. */
  detail?: string;
  /** "times" karosunda karşılaştırma çubuğu: normal = 1, bu yön = `ratio` (yalnız > 1 ve ölçülmüşse). */
  ratio?: number;
}

export interface StoryTilesInput {
  /** `undefined` = okunamadı, `null` = hiç plan yok. */
  plan: WeeklyPlan | null | undefined;
  /** Yeni fikir sayısı; okunamadıysa undefined. */
  newIdeas?: number;
  /** Plan maddelerinin durumları (`plan.items` ile aynı sırada); okunamadıysa undefined. */
  statuses?: readonly PlanItemStatus[];
}

function foundTile({ plan, newIdeas }: StoryTilesInput): StoryTile {
  if (plan) {
    const inPlan = plan.items.length;
    const spare = plan.alternatives.length;
    const total = inPlan + spare;
    if (total === 0) return { kind: "found", figure: "0", sentence: "Bu hafta için fikir bulamadım." };
    const detail =
      spare > 0 ? `Bu haftanın planında ${formatNumber(inPlan)}, yedekte ${formatNumber(spare)}.` : `Hepsi bu haftanın planında.`;
    return { kind: "found", figure: formatNumber(total), sentence: `Senin için ${formatNumber(total)} fikir buldum.`, detail };
  }
  if (newIdeas === undefined) return { kind: "found", sentence: "Fikirleri şu an sayamadım." };
  if (newIdeas === 0) return { kind: "found", figure: "0", sentence: "Şu an bekleyen yeni fikir yok." };
  return { kind: "found", figure: formatNumber(newIdeas), sentence: `Senin için ${formatNumber(newIdeas)} yeni fikir buldum.` };
}

/** Yönün düz dilde tarifi (panel jargonu yok): "Soru ile açılan videolar", "Sonunda izleyiciden bir şey istenmeyen videolar". */
function directionPhrase(direction: FocusDirection): string {
  switch (direction.group) {
    case "hook_type":
      return `${direction.label} ile açılan videolar`;
    case "duration_bucket":
      return `${direction.label} süreli videolar`;
    case "topic_cluster":
      return `${direction.label} konulu videolar`;
    case "cta_type": {
      const known = (CTA_TYPES as readonly string[]).includes(direction.value);
      if (!known || direction.value === "none") return "Sonunda izleyiciden bir şey istenmeyen videolar";
      return `Sonunda izleyiciden ${CTA_TYPE_PLAIN[direction.value as CtaType]} istenen videolar`;
    }
  }
}

function timesTile({ plan }: StoryTilesInput): StoryTile {
  const direction = plan?.sections.focus.directions.find((item) => item.impact !== undefined && Number.isFinite(item.impact) && item.impact > 0);
  const figure = direction?.impact === undefined ? undefined : formatDecimal(direction.impact, 1);
  if (direction === undefined || direction.impact === undefined || figure === undefined) {
    return { kind: "times", sentence: "Hangi tür videonun daha çok izlendiğini henüz ölçemedim.", detail: plan?.sections.focus.unmeasuredReason };
  }
  return {
    kind: "times",
    figure,
    unit: "katı",
    sentence: `Bu tür videolar normalin ${figure} katı izleniyor.`,
    detail: `${directionPhrase(direction)} · ${formatNumber(direction.sampleSize)} videoya baktım.`,
    ratio: direction.impact > 1 ? direction.impact : undefined,
  };
}

function resultTile({ statuses }: StoryTilesInput): StoryTile {
  const withResult = (statuses ?? []).filter((status) => status.kind === "result" && status.resultPhrase !== undefined);
  if (withResult.length > 0) {
    const best = withResult.find((status) => status.strongResult) ?? withResult[0];
    return {
      kind: "result",
      figure: formatNumber(withResult.length),
      sentence: withResult.length === 1 ? "Yayınladığın bir videonun sonucu geldi." : `Yayınladığın ${formatNumber(withResult.length)} videonun sonucu geldi.`,
      detail: `Videon ${best.resultPhrase}.`,
    };
  }
  const waiting = (statuses ?? []).filter((status) => status.kind === "awaiting_result").length;
  return {
    kind: "result",
    sentence: "Sonuçlar henüz ölçülmedi.",
    detail: waiting > 0 ? `${formatNumber(waiting)} videonun ilk sayımını bekliyorum.` : "İlk sayımı, videon yayına çıktıktan 7 gün sonra yaparım.",
  };
}

export function buildStoryTiles(input: StoryTilesInput): [StoryTile, StoryTile, StoryTile] {
  return [foundTile(input), timesTile(input), resultTile(input)];
}
