/**
 * Mock haftalık plan: niş dışı içerik. Konu eleğinin (`topicScreens`) niş dışı bulduğu içerik plan hesabından ÇIKAR (ondan "tutan yön"
 * öğrenilmez; `lib/insights/pool.ts` ile aynı kural) ve "Kaçın" bölümünde sahibine göre özetlenir (`lib/insights/avoid.ts` ile aynı
 * biçim: `kind: "off_niche"`).
 */
import type { ContentItem } from "@/lib/domain/content";
import { confidenceForSample, type AvoidEntry } from "@/lib/domain/weekly-plan";
import { median } from "@/lib/metrics/stats";

const OFF_NICHE_MAX = 3;

/** İzlenen rakiplerin niş dışı videoları, sahibine göre: çok video önce, eşitlikte ad. En çok 3 kayıt. */
export function offNicheAvoidEntries(items: readonly ContentItem[], offNiche: ReadonlySet<string>, trackedIds: ReadonlySet<string>): AvoidEntry[] {
  const byOwner = new Map<string, ContentItem[]>();
  for (const item of items) {
    if (!offNiche.has(item.id) || item.owner.kind !== "competitor" || !trackedIds.has(item.owner.id)) continue;
    byOwner.set(item.owner.handle, [...(byOwner.get(item.owner.handle) ?? []), item]);
  }
  return [...byOwner]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, OFF_NICHE_MAX)
    .map(([handle, videos]): AvoidEntry => ({
      kind: "off_niche",
      group: "off_niche",
      value: handle,
      label: `@${handle}`,
      medianLift: median(videos.flatMap((c) => (c.score.lift === undefined ? [] : [c.score.lift]))),
      sampleSize: videos.length,
      confidence: confidenceForSample(videos.length),
      reason: `@${handle}: ${videos.length} video niş dışı (konu eleği); lift'leri yön ve aday hesabına alınmadı.`,
    }));
}
