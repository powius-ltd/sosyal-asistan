import type { ContentItem } from "@/lib/domain/content";

/** Rakip (`recentOutliers`) ve kendi tutan içerikleri tek listede, lift'e göre azalan (ölçülemeyen sona). */
export function mergeOutliers(competitor: ContentItem[], own: ContentItem[], limit: number): ContentItem[] {
  const byId = new Map<string, ContentItem>();
  for (const item of [...competitor, ...own]) byId.set(item.id, item);
  return [...byId.values()]
    .sort((a, b) => (b.score.lift ?? Number.NEGATIVE_INFINITY) - (a.score.lift ?? Number.NEGATIVE_INFINITY))
    .slice(0, limit);
}
