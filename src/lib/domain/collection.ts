/**
 * Koleksiyonlar ("Kaydet" / swipe file): kullanıcının içerikleri (rakip tutanları ya da kendi içerikler) adlandırılmış
 * gruplara ayırması. Tablolar: `collections`, `collection_items` (PLAN.md "Ek özellikler").
 *
 * Rakip videosu SAKLANMAZ kuralı: koleksiyon yalnız içerik kimliği + kullanıcı notu tutar; görünen bilgi (adres, lift,
 * hook türü) içerikten okunur (`ContentSummary`).
 */
import type { ContentSummary } from "@/lib/domain/content-summary";
import { foldTurkish } from "@/lib/text";

/** Koleksiyon adı üst sınırı (kod noktası). */
export const COLLECTION_NAME_MAX = 60;
/** Koleksiyon açıklaması üst sınırı (kod noktası). */
export const COLLECTION_DESCRIPTION_MAX = 300;
/** Öğe notu üst sınırı (kod noktası). */
export const COLLECTION_NOTE_MAX = 500;
/** `listCollectionMembership` tek çağrıda en çok kaç içerik kimliği alır (bir sayfa içerik; en büyük sayfa 200). */
export const COLLECTION_MEMBERSHIP_IDS_MAX = 200;

export interface Collection {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  /** Koleksiyondaki öğe sayısı (ölçülmüş sayaç: boş koleksiyon 0'dır). */
  itemCount: number;
  createdAt: string;
  /** Yeniden adlandırma ya da öğe ekleme/çıkarma zamanı. */
  updatedAt: string;
}

/** Bir içeriğin bir koleksiyondaki üyeliği. Aynı içerik aynı koleksiyonda en çok bir kez bulunur. */
export interface CollectionItem {
  collectionId: string;
  /** `content_items.id` (kendi ya da rakip içerik). */
  contentId: string;
  addedAt: string;
  note?: string;
}

/** Koleksiyon öğesi + içerik özeti (koleksiyon sayfası içerik başına okuma yapmaz). */
export interface CollectionItemView extends CollectionItem {
  content: ContentSummary;
}

export interface CollectionDetail {
  collection: Collection;
  /** Yeniden eskiye (`addedAt`). */
  items: CollectionItemView[];
}

/**
 * Ad benzersizliği anahtarı: baş/son boşluk kırpılır, boşluk dizileri tek boşluk olur, Türkçe İ/ı ve aksan duyarsız
 * katlanır ("İlham" = "ILHAM" = "ilham"). Tüm depo uygulamaları AYNI kuralı kullanır (Supabase: bu anahtar için
 * benzersiz indeks). Yalnız karşılaştırma içindir; ekranda `name` görünür.
 */
export function collectionNameKey(name: string): string {
  return foldTurkish(name.trim().replace(/\s+/g, " "));
}
