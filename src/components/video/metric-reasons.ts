import type { ContentItem } from "@/lib/domain/content";

export type MetricField = "views" | "likes" | "comments" | "shares" | "saves" | "reach" | "avgWatchSec";

/** Rakip verisi herkese açık toplanır; bu alanları yalnız hesabın sahibi (resmi API) görür. */
const OWNER_ONLY_FIELDS: readonly MetricField[] = ["saves", "reach", "avgWatchSec"];

/** Ölçülemeyen metrik için "neden tire?" açıklaması (`MeasuredValue` ipucu balonu). */
export function unmeasuredReason(field: MetricField, item: { owner: Pick<ContentItem["owner"], "kind">; format: ContentItem["format"] }): string {
  if (item.owner.kind === "competitor" && OWNER_ONLY_FIELDS.includes(field)) {
    return "Rakip verisi scraping ile gelir; kaydetme, erişim ve izlenme süresini yalnız hesabın sahibi görür.";
  }
  if (field === "views" && (item.format === "image" || item.format === "carousel")) {
    return "Bu biçimde platform izlenme sayısı vermez.";
  }
  return "Platform bu içerik için bu değeri vermedi.";
}
