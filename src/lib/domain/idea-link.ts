/**
 * Fikir ↔ yayınlanan Reels bağının çekirdek tipleri (`idea_content_links`, migration 0010). `intel.ts` bunları yeniden dışa verir
 * (`Idea.reelLink`); satır modeli ve ölçüm tipleri `domain/outcomes.ts`'tedir. Dosya ayrıdır: `intel.ts` 400 satır sınırında.
 */
import type { ContentSummary } from "@/lib/domain/content-summary";
import type { IdeaStatus } from "@/lib/domain/intel";

/**
 * Fikir ↔ yayınlanan Reels bağının durumu (`idea_content_links.status`): `awaiting_content` link verildi, kendi içerikte henüz yok
 * (sonraki toplamada çözülür) · `suggested` otomatik eşleşme önerisi (sessiz bağ YOK, onay kullanıcıda) · `confirmed` onaylı bağ
 * (fikir `published` olur) · `rejected` öneri reddedildi ya da onaylı bağ kaldırıldı.
 */
export type IdeaLinkStatus = "awaiting_content" | "suggested" | "confirmed" | "rejected";

export const IDEA_LINK_STATUSES: readonly IdeaLinkStatus[] = ["awaiting_content", "suggested", "confirmed", "rejected"];

/** manual_url: kullanıcı linki yapıştırdı (onay sayılır) · auto_match: toplama sonrası otomatik eşleşme (yalnız öneri yazar). */
export type IdeaLinkOrigin = "manual_url" | "auto_match";

export const IDEA_LINK_ORIGINS: readonly IdeaLinkOrigin[] = ["manual_url", "auto_match"];

/**
 * Fikrin AKTİF bağı (en çok bir): onaylı ya da içerik bekleyen. Öneriler (`suggested`) ve reddedilenler fikre gömülmez:
 * `listIdeaLinks` ile okunur. Bağ yoksa `Idea.reelLink` undefined'dır.
 */
export interface IdeaReelLink {
  linkId: string;
  status: Extract<IdeaLinkStatus, "awaiting_content" | "confirmed">;
  origin: IdeaLinkOrigin;
  shortcode: string;
  /** Bağlı kendi içerik (`confirmed` iken dolu; `awaiting_content` iken undefined). */
  contentItemId?: string;
  /** Bağlı içeriğin özeti (güncel lift dahil); `awaiting_content` iken undefined. */
  content?: ContentSummary;
}

/**
 * Onaylı bağ fikri `published` yapar: `new/saved/scripted/scheduled → published`. Reddedilmiş (`dismissed`) fikre Reels
 * bağlanamaz; zaten `published` fikir (yayın işi yoluyla) bağlanabilir, durum aynı kalır. `IDEA_TRANSITIONS` değişmez
 * (düğmeler `published` sunmaz): geçişi yalnız bağ onayı yapar, bağ kaldırılınca fikir önceki durumuna döner.
 */
export function canConfirmIdeaLink(status: IdeaStatus): boolean {
  return status !== "dismissed";
}
