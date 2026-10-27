/**
 * Tek videonun anatomisi (`deriveVideoAnatomy`; saf, LLM yok): analizdeki bölümlerden faz çizelgesi, hook uzunluğu, ilk bölüme geçiş,
 * CTA konumu; kurgu özeti analizden, ekran yazısı zamanları transcript `segments`'ten (kanal "screen"). Ölçülemeyen her alan
 * `unmeasured`'a SEBEBİYLE yazılır (0 değil). Hook/CTA türü ve süre kovası burada yoktur: Karşılaştırma verisinden (`getInsights`) okunur.
 */
import { ctaPositionBucket } from "@/lib/anatomy/buckets";
import { derivePhases, orderSections } from "@/lib/anatomy/phases";
import type { CtaPosition, VideoAnatomy, VideoAnatomyField } from "@/lib/domain/anatomy";
import type { ContentItem } from "@/lib/domain/content";
import type { AnalysisSection, ContentAnalysis, Transcript } from "@/lib/domain/intel";
import { maskExpiredTranscript } from "@/lib/data/views/transcript-expiry";
import { countWords } from "@/lib/intel/normalize";

export interface VideoAnatomyInput {
  item: ContentItem;
  /** Yalnız `status = ok` analizden anatomi üretilir; aksi halde `undefined` döner ("analiz yok"). */
  analysis: Pick<ContentAnalysis, "status" | "hookText" | "sections" | "editMetrics">;
  /** Ekran yazısı zamanları için (yoksa/süresi dolduysa ölçülemez). */
  transcript?: Transcript;
  /** Verilirse süresi dolmuş transcript maskelenir (90 gün kuralı: depo da maskeler, burada ikinci güvence). */
  now?: Date;
}

type Reasons = Partial<Record<VideoAnatomyField, string>>;

const NO_SECTIONS = "Analizde bölüm yok.";

function hookWordsOf(hookText: string | undefined): { value?: number; reason?: string } {
  const words = hookText === undefined ? 0 : countWords(hookText);
  return words > 0 ? { value: words } : { reason: "İncelemede açılış cümlesi yok." };
}

/** Hook'tan sonraki ilk (hook olmayan) bölümün başlangıcı. */
function firstSectionAt(ordered: readonly AnalysisSection[]): { value?: number; reason?: string } {
  const hookIndex = ordered.findIndex((s) => s.type === "hook");
  if (hookIndex < 0) return { reason: "İncelemede açılış bölümü yok." };
  let next = hookIndex + 1;
  while (ordered[next]?.type === "hook") next++;
  if (next >= ordered.length) return { reason: "Açılıştan sonra başka bölüm yok." };
  const start = ordered[next].startSec;
  return start === undefined ? { reason: "Açılıştan sonraki bölümün başlangıç saniyesi yok." } : { value: start };
}

/**
 * CTA konumu: SON CTA bölümünün başladığı an, videonun bitişine kaç sn kala. CTA bölümü yoksa `none` (bölümler biliniyorsa ölçülmüş
 * bir gerçektir); süre ya da CTA zamanı yoksa ölçülemez.
 */
function ctaPositionOf(ordered: readonly AnalysisSection[], durationSec: number | undefined): { value?: CtaPosition; reason?: string } {
  if (ordered.length === 0) return { reason: NO_SECTIONS };
  const ctas = ordered.filter((s) => s.type === "cta");
  if (ctas.length === 0) return { value: "none" };
  const start = ctas[ctas.length - 1].startSec;
  if (durationSec === undefined) return { reason: "Video süresi bilinmiyor; çağrının yeri hesaplanamadı." };
  if (start === undefined) return { reason: "Çağrı bölümünün başlangıç saniyesi yok." };
  const bucket = ctaPositionBucket(durationSec - start);
  return bucket === undefined ? { reason: "Çağrının zamanı video süresinden büyük; tutarsız veri." } : { value: bucket };
}

/** Ekran yazılarının başlangıç saniyeleri (transcript `segments`, kanal "screen"). Transcript yok/süresi dolmuş/ekran kanalı yoksa ölçülemez. */
function screenTextTimes(transcript: Transcript | undefined, now: Date | undefined): { value?: number[]; reason?: string } {
  if (transcript === undefined) return { reason: "Bu videonun konuşma metni yok." };
  const live = now === undefined ? transcript : maskExpiredTranscript(transcript, now);
  if (live.segments === undefined) return { reason: "Konuşma metninin saklama süresi doldu (rakip videolarının metni 90 gün sonra silinir); ekran yazısı zamanları kalmadı." };
  const times = live.segments.filter((s) => s.channel === "screen").map((s) => s.startSec).sort((a, b) => a - b);
  return times.length === 0 ? { reason: "Konuşma metninde ekran yazısı yok." } : { value: times };
}

/** Kurgu özeti yoksa/alanı ölçülmediyse kesme/dk sebebi. */
function cutsReason(editMetrics: VideoAnatomy["editMetrics"]): string | undefined {
  if (editMetrics?.cutsPerMinute !== undefined) return undefined;
  return editMetrics === undefined ? "Kurgu ölçümü yok (eski analiz sürümü ya da ölçülemedi)." : "Bu analizde dakikadaki kesme sayısı ölçülemedi.";
}

/** Videonun anatomisi; analiz `ok` değilse `undefined` (sayfa "analiz yok" der). */
export function deriveVideoAnatomy({ item, analysis, transcript, now }: VideoAnatomyInput): VideoAnatomy | undefined {
  if (analysis.status !== "ok") return undefined;
  const ordered = orderSections(analysis.sections);
  const phases = derivePhases(analysis.sections, item.durationSec);
  const unmeasured: Reasons = {};

  if (ordered.length === 0) unmeasured.phases = NO_SECTIONS;
  else if (ordered.every((s) => s.startSec === undefined)) unmeasured.phases = "Bölümlerin zamanı yok; faz süreleri hesaplanamadı.";

  const hook = hookWordsOf(analysis.hookText);
  if (hook.reason) unmeasured.hookWords = hook.reason;
  const first = ordered.length === 0 ? { reason: NO_SECTIONS } : firstSectionAt(ordered);
  if (first.reason) unmeasured.firstSectionAtSec = first.reason;
  const cta = ctaPositionOf(ordered, item.durationSec);
  if (cta.reason) unmeasured.ctaPosition = cta.reason;
  const cuts = cutsReason(analysis.editMetrics);
  if (cuts) unmeasured.cutsPerMinute = cuts;
  const screen = screenTextTimes(transcript, now);
  if (screen.reason) unmeasured.screenText = screen.reason;

  const bodyTypes = [...new Set(phases.filter((p) => p.phase === "body").flatMap((p) => p.sections.map((s) => s.type)))];
  return {
    contentItemId: item.id,
    ownerHandle: item.owner.handle,
    isOwn: item.owner.kind === "own",
    durationSec: item.durationSec,
    lift: item.score.lift,
    liftTier: item.score.liftTier,
    phases,
    hookWords: hook.value,
    firstSectionAtSec: first.value,
    ctaPosition: cta.value,
    bodyTypes,
    editMetrics: analysis.editMetrics,
    screenTextAtSec: screen.value,
    unmeasured,
  };
}
