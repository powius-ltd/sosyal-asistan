/**
 * Biçim kartı (`ornek_video.bicim`): tutmuş örnek videonun "neye benziyor"u, panelin video analizinden. "Neden tuttu" YAZILMAZ.
 * Ölçülemeyen alan yazılmaz (`undefined ≠ 0`): eski analizde 5 ek biçim alanı yoktur, o zaman bu alanlar kartta olmaz.
 */
import type { ContentAnalysis, EditMetrics } from "@/lib/domain/intel";
import type { Bicim } from "@/lib/studio-order/schema";

export type CardAnalysis = Pick<ContentAnalysis, "status" | "hookType" | "hookSource" | "editMetrics" | "promptVersion">;

const TEMPO: Record<NonNullable<EditMetrics["tempo"]>, NonNullable<Bicim["tempo"]>> = { slow: "yavas", medium: "orta", fast: "hizli" };
const TEXT_POSITION: Record<NonNullable<EditMetrics["textPosition"]>, NonNullable<Bicim["yazi_konumu"]>> = { top: "ust", middle: "orta", bottom: "alt" };
const LAYOUT: Record<NonNullable<EditMetrics["layout"]>, NonNullable<Bicim["yerlesim"]>> = { full: "tam", split: "bolunmus", screen_recording: "ekran_kaydi" };
const OPENING_VISUAL: Record<NonNullable<EditMetrics["openingVisual"]>, NonNullable<Bicim["acilis_gorseli"]>> = { face: "yuz", product: "urun", screen: "ekran", broll: "broll" };

/** Sözlükteki karşılığı olmayan değer kartta YOK (tahmin yok). */
function pick<K extends string, V>(table: Record<K, V>, key: K | undefined): V | undefined {
  return key === undefined ? undefined : table[key];
}

/** Kart kurulamazsa (analiz yok ya da başarısız) undefined; en az bir alan yoksa da undefined. */
export function buildFormatCard(analysis: CardAnalysis | undefined, durationSec: number | undefined): Bicim | undefined {
  if (analysis === undefined || analysis.status !== "ok") return undefined;
  const m = analysis.editMetrics;
  const card: Bicim = {
    ...(durationSec !== undefined && durationSec > 0 ? { sure_sn: durationSec } : {}),
    ...(m?.cutCount !== undefined ? { kesme: m.cutCount } : {}),
    ...(m?.avgShotSec !== undefined && m.avgShotSec > 0 ? { ort_plan_sn: m.avgShotSec } : {}),
    ...(pick(TEMPO, m?.tempo) ? { tempo: pick(TEMPO, m?.tempo) } : {}),
    ...(m?.cutsInFirst3Sec !== undefined ? { ilk_3sn_kesim: m.cutsInFirst3Sec } : {}),
    ...(m?.onScreenTextCount !== undefined ? { ekran_yazisi: m.onScreenTextCount } : {}),
    ...(pick(TEXT_POSITION, m?.textPosition) ? { yazi_konumu: pick(TEXT_POSITION, m?.textPosition) } : {}),
    ...(m?.textLines !== undefined && m.textLines > 0 ? { yazi_satir: m.textLines } : {}),
    ...(pick(LAYOUT, m?.layout) ? { yerlesim: pick(LAYOUT, m?.layout) } : {}),
    ...(analysis.hookSource === "speech" ? { acilis_kanali: "konusma" as const } : analysis.hookSource === "screen_text" ? { acilis_kanali: "ekran_yazisi" as const } : {}),
    ...(analysis.hookType ? { acilis_turu: analysis.hookType } : {}),
    ...(pick(OPENING_VISUAL, m?.openingVisual) ? { acilis_gorseli: pick(OPENING_VISUAL, m?.openingVisual) } : {}),
    ...(m?.onCameraSpeaker !== undefined ? { yuz: m.onCameraSpeaker } : {}),
    ...(m?.hasMusic !== undefined ? { muzik: m.hasMusic } : {}),
    ...(m?.hasBurnedCaptions !== undefined ? { gomulu_altyazi: m.hasBurnedCaptions } : {}),
    ...(analysis.promptVersion ? { analiz_surumu: analysis.promptVersion } : {}),
  };
  const measured = Object.keys(card).filter((key) => key !== "analiz_surumu");
  return measured.length === 0 ? undefined : card;
}
