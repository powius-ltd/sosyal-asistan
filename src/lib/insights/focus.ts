/**
 * "Neye yüklen" bölümü (kod): 2–3 yön. Gruplar hook türü (analiz varsa), süre kovası, CTA türü ve konu kümesidir (`groups.ts`);
 * puan = büzülmüş etki × yenilik × geri besleme (etki = rakipte medyan lift, az örnekte baza büzülür; yenilik = kendi hesap
 * denemediyse 1,5; geri besleme = geçen haftaların sonucu, `feedback.ts`). Yalnız baz çizgisinin üstündeki
 * (etki > 1), ≥ 2 ölçülmüş videolu ve karşılaştırılabilir eksendeki gruplar aday olur. Çeşitlilik: önce her eksenden en iyi grup
 * (ör. iki süre kovası üst üste gelmesin), 2'ye tamamlanamazsa kalanlar puana göre. Güven örneklemden (`confidenceForSample`:
 * n < 5 düşük). `rationale` kısa kod metnidir; asıl gerekçeyi `synthesize-week` yazar.
 * Rakipsiz mod (`mode.ts`): gruplar kendi videolarındandır (yenilik yok; gerekçe "kendi tutanların arasında"), ayrıca "Tekrarla / seriye çevir"
 * yönü (`repeat.ts`) bir yer tutar: `FOCUS_MAX` içinde kalır, güven sıralaması aynıdır.
 */
import type { FocusDirection, FocusGroup, FocusSection } from "@/lib/domain/weekly-plan";
import { FOCUS_MAX, FOCUS_MIN } from "@/lib/insights/constants";
import { feedbackNote } from "@/lib/insights/feedback";
import { byLiftDesc, groupTitle, isPromisingGroup, type ScoredGroup } from "@/lib/insights/groups";
import { BASIS_LABEL } from "@/lib/insights/mode";
import { REASON_PLAIN } from "@/lib/plain-language-plan";

const EVIDENCE_PER_DIRECTION = 3;

function rationaleOf(group: ScoredGroup): string {
  const note = feedbackNote(group.feedback);
  if (group.repeat) {
    return `${REASON_PLAIN.focusRepeat(group.label, BASIS_LABEL.own, { sampleSize: group.liftN, impact: group.impact })}${note ? ` ${note}` : ""}`;
  }
  if (group.basis === "own") {
    return `${REASON_PLAIN.focusOwn(groupTitle(group), BASIS_LABEL.own, { sampleSize: group.liftN, impact: group.impact, outliers: group.outlierCount })}${note ? ` ${note}` : ""}`;
  }
  return `${REASON_PLAIN.focusRivals(groupTitle(group), { sampleSize: group.liftN, impact: group.impact, outliers: group.outlierCount, ownTried: group.ownTried })}${note ? ` ${note}` : ""}`;
}

function directionOf(group: ScoredGroup): FocusDirection {
  return {
    group: group.group,
    value: group.value,
    label: group.label,
    impact: group.impact,
    novelty: group.novelty,
    score: group.score ?? 0,
    sampleSize: group.liftN,
    confidence: group.confidence,
    ownTried: group.ownTried,
    rationale: rationaleOf(group),
    evidenceContentIds: group.items.filter((pi) => pi.lift !== undefined).sort(byLiftDesc).slice(0, EVIDENCE_PER_DIRECTION).map((pi) => pi.item.id),
  };
}

/**
 * Seçim: puan sırasıyla eksen başına en iyi grup, `FOCUS_MAX`'a kadar; `FOCUS_MIN`'e tamamlanamazsa kalanlardan. Sıra = puan;
 * ancak düşük güvenli yön (az örnek) orta/yüksek güvenlilerin önüne geçemez (puanı ne olursa olsun sonda sıralanır).
 */
export function pickDirections(groups: readonly ScoredGroup[], limits: { min: number; max: number } = { min: FOCUS_MIN, max: FOCUS_MAX }): ScoredGroup[] {
  const promising = groups.filter(isPromisingGroup);
  const eligible = [...promising.filter((g) => g.confidence !== "low"), ...promising.filter((g) => g.confidence === "low")];
  const axes = new Set<FocusGroup>();
  const top: ScoredGroup[] = [];
  for (const g of eligible) {
    if (top.length < limits.max && !axes.has(g.group)) {
      top.push(g);
      axes.add(g.group);
    }
  }
  for (const g of eligible) if (top.length < limits.min && !top.includes(g)) top.push(g);
  return top.sort((a, b) => eligible.indexOf(a) - eligible.indexOf(b));
}

/** Yön çıkmadıysa sebep (boş liste "yön yok" demek değil, çoğu zaman "ölçülemedi"). */
function unmeasuredReason(groups: readonly ScoredGroup[]): string {
  if (groups.length > 0 && groups.every((g) => g.basis === "own")) {
    return groups.every((g) => g.impact === undefined) ? REASON_PLAIN.focusNone.ownUnmeasured : REASON_PLAIN.focusNone.ownNone;
  }
  if (groups.length === 0) return REASON_PLAIN.focusNone.noRivalVideos;
  if (groups.every((g) => g.impact === undefined)) return REASON_PLAIN.focusNone.rivalUnmeasured;
  if (groups.some((g) => !g.comparable)) return REASON_PLAIN.focusNone.notComparable;
  return REASON_PLAIN.focusNone.none;
}

/** `repeat` (rakipsiz mod) bir yer tutar; yönler güven sırasıyla (düşük güven sonda), eşitlikte puanla dizilir. */
export function buildFocus(groups: readonly ScoredGroup[], repeat?: ScoredGroup): FocusSection {
  const picked = pickDirections(groups, repeat ? { min: FOCUS_MIN - 1, max: FOCUS_MAX - 1 } : undefined);
  const ordered = repeat ? [...picked, repeat].sort((a, b) => Number(a.confidence === "low") - Number(b.confidence === "low") || (b.score ?? 0) - (a.score ?? 0)) : picked;
  const directions = ordered.map(directionOf);
  return directions.length > 0 ? { directions } : { directions: [], unmeasuredReason: unmeasuredReason(groups) };
}
