import { SaveToCollectionMenu } from "@/components/collections/save-to-collection-menu";

export interface SaveToCollectionButtonProps {
  /** Kaydedilecek içerik (`content_items.id`; kendi ya da rakip içerik). */
  contentId: string;
  /**
   * İçeriğin üye olduğu koleksiyon kimlikleri (düğmenin "Kaydet" / "Kaydedildi" ilk durumu). Düğme KENDİ BAŞINA okuma
   * yapmaz: kullanan sayfa bir kez okur (`loadCollectionMembership`, TEK toplu sorgu) ve içerik başına verir. `undefined` =
   * bilinmiyor (okunamadı): "Kaydet" görünür, menü açılınca durum yüklenir.
   */
  initialCollectionIds?: string[];
}

/**
 * "Kaydet" düğmesi: içeriği koleksiyona kaydeder/çıkarır. Yerleşim: Tutanlar kartı + tablo satırı, Video analizi başlığı.
 * Etkileşim ve koleksiyon listesi istemci yaprağında (`SaveToCollectionMenu`); ilk durum sayfadan gelir.
 */
export function SaveToCollectionButton({ contentId, initialCollectionIds }: SaveToCollectionButtonProps) {
  return <SaveToCollectionMenu contentId={contentId} initialCollectionIds={initialCollectionIds} />;
}
