import { PUBLISH_LIMIT_24H } from "@/components/publish/publish-limits";
import type { OwnAccount } from "@/lib/domain/competitor";
import type { PublishSummary } from "@/lib/domain/publish";

export interface QuotaRow {
  accountId: string;
  handle: string;
  /** Son 24 saatte panelden yayınlanan iş sayısı. */
  used: number;
  limit: number;
}

/**
 * Hesap başına 24 saatlik hareketli pencere kotası (yalnız resmi API ile bağlı hesaplar).
 *
 * Sayım depodan gelir (`PanelRepository.getPublishSummary`): iş listesindeki limite (200) bağlı değildir ve
 * kuralı (`isPublishedWithinQuotaWindow`) depo uygular. Sayım PANELDEN yayınlanan işlerdir; Meta'nın kendi sayacı
 * dışarıdan yapılan yayınları da içerir, gerçek değer Faz 3'te `PublisherAdapter.getQuota` ile okunur. Özette
 * anahtarı olmayan hesap = 0 yayın (ölçülmüş sıfır). Bağlı hesap yoksa boş liste döner — çağıran "bağlantı yok"
 * gösterir (0 DEĞİL).
 */
export function computePublishQuota(
  accounts: OwnAccount[],
  summary: Pick<PublishSummary, "publishedLast24hByAccount">,
  /** Hesap yayınlanabilir mi (varsayılan: resmi bağlantı); sayfa `isPublishableAccount` kuralını (Zernio anahtarı dahil) verir. */
  isPublishable: (account: OwnAccount) => boolean = (account) => account.connection === "connected",
): QuotaRow[] {
  return accounts
    .filter(isPublishable)
    .map((account) => ({
      accountId: account.id,
      handle: account.handle,
      used: summary.publishedLast24hByAccount[account.id] ?? 0,
      limit: PUBLISH_LIMIT_24H,
    }));
}
