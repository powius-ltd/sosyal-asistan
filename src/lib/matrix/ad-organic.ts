/**
 * Organik içeriğin reklam işareti (Tutanlar ve Açılış kütüphanesi rozetleri): saf, LLM yok. Yalnız KENDİ içerik işaret alır (rakip videosu
 * reklama çevrilmez, rozet yok). İçerik en az bir kreatife bağlıysa reklam kararı (`AdUsage`: tuttu / yoruldu / tutmadı / henüz erken);
 * bağlı değilse ve 18'in kuralı (`buildLearningMarks`: son 60 gün, alışılmışın ≥ 2 katı, güvenilir baz) tutuyorsa "reklam adayı".
 * Organik ve reklam ölçüleri BİRLEŞTİRİLMEZ: rozet yalnız reklam tarafının durumunu söyler.
 */
import { buildLearningMarks, type OrganicFact } from "@/lib/ads/learning";
import type { AdUsage } from "@/lib/domain/ads";
import type { ContentItem } from "@/lib/domain/content";
import { DAY_MS } from "@/lib/time";

export type OrganicAdMark = { kind: "candidate" } | { kind: "used"; signal: AdUsage["signal"]; confidence: AdUsage["confidence"] };

/** İçerik kimliği → reklam işareti; işaretsiz içerik haritada yok. */
export type OrganicAdMarks = Record<string, OrganicAdMark>;

const usedMarks = (usage: readonly AdUsage[]): OrganicAdMarks =>
  Object.fromEntries(usage.map((u): [string, OrganicAdMark] => [u.contentItemId, { kind: "used", signal: u.signal, confidence: u.confidence }]));

/** Yalnız "reklamda kullanıldı" işaretleri (içerik özeti olmayan listeler için; ör. açılış kütüphanesi). */
export const adUsageMarks = usedMarks;

/**
 * Tutan içerik listesi için işaretler. `analysisVerified` yerine analiz durumu `ok` sayılır (listede kanıt doğrulaması yok); niş içi varsayılır
 * (liste zaten niş dışını süzer). Yayın tarihi bilinmeyen içerik aday olamaz (yaşı bilinmiyor).
 */
export function organicAdMarks(items: readonly ContentItem[], usage: readonly AdUsage[], now: Date): OrganicAdMarks {
  const marks = usedMarks(usage);
  const organic: OrganicFact[] = items.flatMap((item) => {
    const published = item.publishedAt === undefined ? Number.NaN : Date.parse(item.publishedAt);
    if (item.owner.kind !== "own" || Number.isNaN(published) || marks[item.id] !== undefined) return [];
    return [{ contentId: item.id, score: item.score, ageDays: Math.floor((now.getTime() - published) / DAY_MS), inNiche: true, analysisVerified: item.analysisStatus === "ok", linkedToAd: false }];
  });
  for (const mark of buildLearningMarks({ organic, cells: [], ads: [] })) {
    if (mark.kind === "ad_candidate" && mark.subject.contentId !== undefined) marks[mark.subject.contentId] = { kind: "candidate" };
  }
  return marks;
}
