/**
 * İçerik ÖZETİ: bir içeriğin listelerde gösterilen küçük görünümü (sahip, platform, alt yazı özeti, adres, güncel lift,
 * hook türü). Fikir kanıtı (`IdeaEvidence`), koleksiyon öğesi ve haftalık özet aynı özeti kullanır: liste başına
 * içerik okumak (N+1) gerekmez. Özet, deponun okuduğu anda içerikten türettiği görünümdür (Supabase:
 * `content_items` ⨝ `content_analyses`); saklanan bir kopya değildir.
 */
import type { ContentItem } from "@/lib/domain/content";
import { evidenceCaption, type ContentAnalysis } from "@/lib/domain/intel";
import type { ContentFormat, Platform } from "@/lib/platforms/types";

export interface ContentSummary {
  contentItemId: string;
  /** İçeriğin sahibi (kendi hesap ya da rakip; "@" yok). */
  ownerHandle: string;
  platform: Platform;
  format: ContentFormat;
  /** Alt yazı özeti (`evidenceCaption`); alt yazı yoksa undefined. */
  caption?: string;
  /** Platformdaki herkese açık adres; yoksa undefined (kullanmadan önce `safeExternalUrl`). */
  url?: string;
  /** İçeriğin GÜNCEL lift'i; hesaplanamadıysa undefined (0 değil). */
  currentLift?: number;
  /** İçeriğin analizindeki hook türü; yalnız `ok` analizden (yoksa/başarısızsa undefined). */
  hookType?: string;
}

/** İçerikten özet türetir. `analysis`: içeriğin analizi (varsa); yalnız `ok` analiz hook türü verir. */
export function summarizeContent(item: ContentItem, analysis?: Pick<ContentAnalysis, "status" | "hookType">): ContentSummary {
  return {
    contentItemId: item.id,
    ownerHandle: item.owner.handle,
    platform: item.platform,
    format: item.format,
    caption: evidenceCaption(item.caption),
    url: item.url,
    currentLift: item.score.lift,
    hookType: analysis?.status === "ok" ? analysis.hookType : undefined,
  };
}
