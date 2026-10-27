/**
 * Koleksiyon ve öğe satırları → domain. `itemCount` sütun değil, üyelerin sayısıdır (`collection_items(count)` gömmesi).
 * Rakip videosu SAKLANMAZ: öğe yalnız içerik kimliği + kullanıcı notu tutar; görünen bilgi içerik özetinden gelir.
 */
import type { Collection, CollectionItem } from "@/lib/domain/collection";
import type { Tables } from "@/lib/supabase/database.types";
import { iso, opt } from "@/lib/data/supabase/mappers/common";

export const COLLECTION_COLUMNS = "id, workspace_id, name, description, created_at, updated_at" as const;
/** Sayaçlı seçim: gömülü `collection_items(count)` → `[{ count: n }]`. */
export const COLLECTION_SELECT = `${COLLECTION_COLUMNS}, collection_items(count)` as const;

export type CollectionRow = Pick<Tables<"collections">, "id" | "workspace_id" | "name" | "description" | "created_at" | "updated_at">;
export type CountedCollectionRow = CollectionRow & { collection_items: { count: number }[] | null };

export function toCollection(row: CollectionRow, itemCount: number): Collection {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: opt(row.description),
    itemCount,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toCountedCollection(row: CountedCollectionRow): Collection {
  return toCollection(row, row.collection_items?.[0]?.count ?? 0);
}

export const ITEM_COLUMNS = "collection_id, content_item_id, added_at, note" as const;
export type CollectionItemRow = Pick<Tables<"collection_items">, "collection_id" | "content_item_id" | "added_at" | "note">;

export function toCollectionItem(row: CollectionItemRow): CollectionItem {
  return { collectionId: row.collection_id, contentId: row.content_item_id, addedAt: iso(row.added_at), ...(row.note ? { note: row.note } : {}) };
}

/**
 * Koleksiyon sırası: en son güncellenen önce; eşitlikte ad (Türkçe), sonra kimlik. Liste, içeriğin koleksiyonları ve toplu
 * üyelik AYNI karşılaştırıcıyı kullanır (sıra her yerde aynı). `updated_at` DB'nin ham metnidir (aynı UTC biçimi:
 * sözcüksel sıra zaman sırasıdır).
 */
export function compareCollections(a: Pick<CollectionRow, "updated_at" | "name" | "id">, b: Pick<CollectionRow, "updated_at" | "name" | "id">): number {
  if (a.updated_at !== b.updated_at) return a.updated_at < b.updated_at ? 1 : -1;
  return a.name.localeCompare(b.name, "tr-TR") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
