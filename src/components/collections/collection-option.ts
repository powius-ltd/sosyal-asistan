import type { Collection } from "@/lib/domain/collection";

/** "Kaydet" menüsünün ihtiyacı olan en küçük koleksiyon görünümü: istemciye yalnız bu gider (workspace kimliği, tarih vb. gitmez). */
export interface CollectionOption {
  id: string;
  name: string;
}

export function toCollectionOption(collection: Pick<Collection, "id" | "name">): CollectionOption {
  return { id: collection.id, name: collection.name };
}
