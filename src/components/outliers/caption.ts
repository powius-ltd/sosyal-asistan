import { truncateText } from "@/lib/text";

/** Alt yazıyı tek satıra indirip `max` kod noktasında keser; boşsa undefined. */
export function captionPreview(caption: string | undefined, max = 140): string | undefined {
  if (caption === undefined) return undefined;
  const flat = truncateText(caption, max);
  return flat === "" ? undefined : flat;
}
