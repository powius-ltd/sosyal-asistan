import type { ContentItem } from "@/lib/domain/content";
import { truncateText } from "@/lib/text";

/** Listelerde içerik başlığı: kısaltılmış alt yazı; alt yazı yoksa kısa kod ya da dış kimlik. */
export function contentTitle(
  item: Pick<ContentItem, "caption" | "shortcode" | "externalId">,
  max = 70,
): string {
  const caption = item.caption?.trim();
  if (caption) return truncateText(caption, max);
  return `İçerik ${item.shortcode ?? item.externalId}`;
}
