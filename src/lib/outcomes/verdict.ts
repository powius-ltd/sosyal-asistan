/**
 * Yön hükmü: planın odak yönlerinden (hook türü / süre kovası / CTA türü / konu) yayınlanan Reels'e UYANLARIN sonucu.
 *
 * Uyma (olgu kaynağı): hook türü = doğrulanmış analizden, yoksa fikirden · süre kovası = gerçek süreden · CTA = açıklamadan
 * `classifyCta` · konu (küme ya da "Tekrarla / seriye çevir") = fikrin bağlı olduğu yön (`Idea.directionRef`, plan yön sırası). Konu
 * etiketleri serbest LLM metnidir (fikrin `details.topic`'i küme adıyla birebir tutmaz); bu yüzden metin yalnız ref'siz eski kayıtta
 * yedektir ve tutmazsa yön sessizce düşmez: "eşleştirilemedi" sebebiyle `unmeasured` olur. Hükmü D+7 lift verir: ≥ `DIRECTION_HELD_MIN_LIFT` tuttu (≥ güçlü eşik → `strong`),
 * altı tutmadı. D+7 lift yoksa `unmeasured` (sebebiyle): D+1/D+3 ham izlenmesi hüküm vermez. Uymadığı bilinen yön listede YOKTUR;
 * uyup uymadığı BİLİNEMEYEN yön (olgu yok) `unmeasured` + sebep: "uymadı" denmez, 0 yazılmaz.
 */
import { DIRECTION_HELD_MIN_LIFT, DIRECTION_STRONG_MIN_LIFT, type Checkpoint, type DirectionOutcome } from "@/lib/domain/outcomes";
import { durationBucketOf } from "@/lib/domain/taxonomy";
import type { Idea } from "@/lib/domain/intel";
import { focusDirectionIndex, type FocusDirection } from "@/lib/domain/weekly-plan";
import { classifyCta } from "@/lib/data/views/insights-cta";
import type { OutcomeContent } from "@/lib/outcomes/content";
import { foldTurkish } from "@/lib/text";

type FitFacts = Pick<OutcomeContent, "analysisHookType" | "durationSec" | "caption">;
type FitIdea = Pick<Idea, "hookType" | "details" | "directionRef">;

/** Yayının yöne uyumu: true/false ya da bilinmiyor (`unknown` = sebep metni). */
type Fit = { fits: true } | { fits: false } | { unknown: string };

/** Konu yönü: fikir hangi plan yönüne bağlıysa o (sıra = `index`); ref yoksa birebir konu adı yedek, o da tutmazsa bilinmiyor. */
function topicFit(direction: FocusDirection, index: number, idea: FitIdea): Fit {
  const ref = focusDirectionIndex(idea.directionRef);
  if (ref !== undefined) return { fits: ref === index };
  const topic = idea.details.topic;
  if (topic !== undefined && foldTurkish(topic) === foldTurkish(direction.value)) return { fits: true };
  return { unknown: "eşleştirilemedi: fikir bir plan yönüne bağlı değil (eski kayıt ya da yön seçilmedi)" };
}

function fitOf(direction: FocusDirection, index: number, idea: FitIdea, facts: FitFacts): Fit {
  switch (direction.group) {
    case "hook_type": {
      const hookType = facts.analysisHookType ?? idea.hookType;
      return hookType === undefined ? { unknown: "hook türü bilinmiyor (analiz ve fikir etiketi yok)" } : { fits: hookType === direction.value };
    }
    case "duration_bucket": {
      const bucket = durationBucketOf(facts.durationSec);
      return bucket === undefined ? { unknown: "yayının süresi bilinmiyor" } : { fits: bucket === direction.value };
    }
    case "cta_type": {
      const cta = classifyCta(facts.caption);
      return cta === undefined ? { unknown: "açıklama yok (CTA belirlenemedi)" } : { fits: cta === direction.value };
    }
    case "topic_cluster":
      return topicFit(direction, index, idea);
  }
}

/** D+7 noktasından neden hüküm verilemediği. */
function missingD7Reason(d7: Checkpoint | undefined): string {
  if (d7 === undefined) return "yayın tarihi bilinmiyor (kontrol noktası kurulamadı)";
  if (d7.status === "measured") return d7.reason ?? "7. gün lift'i hesaplanamadı";
  if (d7.status === "missed") return "7. gün ölçümü zamanında alınmadı";
  return "7. gün ölçümü henüz yok";
}

/**
 * Bir yayının yön sonuçları. `directions`: planın `focus.directions`'ı (SIRASIYLA: fikrin yön ref'i bu sıraya göredir). `d7`: yayının
 * 7. gün noktası (yoksa undefined). Yalnız uyanlar (ve uyumu bilinemeyenler) döner.
 */
export function directionOutcomes(
  directions: readonly FocusDirection[],
  idea: FitIdea,
  facts: FitFacts,
  d7: Checkpoint | undefined,
): DirectionOutcome[] {
  const outcomes: DirectionOutcome[] = [];
  for (const [index, direction] of directions.entries()) {
    const base = { group: direction.group, value: direction.value, label: direction.label };
    const fit = fitOf(direction, index, idea, facts);
    if ("unknown" in fit) {
      outcomes.push({ ...base, verdict: "unmeasured", reason: fit.unknown });
      continue;
    }
    if (!fit.fits) continue;

    const lift = d7?.status === "measured" ? d7.lift : undefined;
    if (lift === undefined) {
      outcomes.push({ ...base, verdict: "unmeasured", reason: missingD7Reason(d7) });
    } else if (lift >= DIRECTION_HELD_MIN_LIFT) {
      outcomes.push({ ...base, verdict: "held", strong: lift >= DIRECTION_STRONG_MIN_LIFT });
    } else {
      outcomes.push({ ...base, verdict: "missed" });
    }
  }
  return outcomes;
}
