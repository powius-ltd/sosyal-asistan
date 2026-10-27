/**
 * Koleksiyonlar ("Kaydet" / swipe file). Doğrulama `lib/data/collection-input.ts`'te (tüm depolarla ortak); ad benzersizliği
 * `collectionNameKey` → `name_key` üzerinde benzersiz indeks (Türkçe İ/ı duyarsız). Öğe eklenince/çıkarılınca koleksiyonun
 * `updated_at`'ı trigger'la (`touch_collection`) güncellenir; not değişimi için burada elle dokunulur.
 */
import {
  collectionNameKey,
  type Collection,
  type CollectionDetail,
  type CollectionItem,
  type CollectionItemView,
} from "@/lib/domain/collection";
import type { CreateCollectionInput } from "@/lib/data/queries";
import {
  parseCollectionName,
  parseCollectionNote,
  parseCreateCollectionInput,
  parseMembershipContentIds,
} from "@/lib/data/collection-input";
import { RepositoryError } from "@/lib/data/repository";
import { loadContentSummaries } from "@/lib/data/supabase/content-summaries";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { isUuid, onlyUuids, unwrap } from "@/lib/data/supabase/errors";
import {
  COLLECTION_COLUMNS,
  COLLECTION_SELECT,
  compareCollections,
  ITEM_COLUMNS,
  toCollection,
  toCollectionItem,
  toCountedCollection,
  type CollectionItemRow,
  type CollectionRow,
  type CountedCollectionRow,
} from "@/lib/data/supabase/mappers/collections";
import { fetchAllRows, inChunks } from "@/lib/data/supabase/paging";
import { requireWorkspace } from "@/lib/data/supabase/workspace";

async function readCounted(ctx: SupabaseContext, wsId: string, collectionIds: readonly string[]): Promise<Collection[]> {
  const rows = await inChunks(collectionIds, async (part) =>
    unwrap(await ctx.db.from("collections").select(COLLECTION_SELECT).eq("workspace_id", wsId).in("id", part).overrideTypes<CountedCollectionRow[], { merge: false }>()),
  );
  return [...rows].sort(compareCollections).map(toCountedCollection);
}

/** En son güncellenen önce; `itemCount` üyelerin sayısıdır (boş koleksiyon 0). */
export async function listCollections(ctx: SupabaseContext, wsId: string): Promise<Collection[]> {
  if (!isUuid(wsId)) return [];
  const rows = await fetchAllRows((from, to) =>
    ctx.db
      .from("collections")
      .select(COLLECTION_SELECT)
      .eq("workspace_id", wsId)
      .order("id", { ascending: true })
      .range(from, to)
      .overrideTypes<CountedCollectionRow[], { merge: false }>(),
  );
  return rows.sort(compareCollections).map(toCountedCollection);
}

/** Koleksiyon + öğeleri (yeniden eskiye, içerik özetiyle: içerik başına okuma yok). Yoksa null. */
export async function getCollection(ctx: SupabaseContext, wsId: string, collectionId: string): Promise<CollectionDetail | null> {
  if (!isUuid(wsId) || !isUuid(collectionId)) return null;
  const [collection] = await readCounted(ctx, wsId, [collectionId]);
  if (!collection) return null;
  const members = await fetchAllRows((from, to) =>
    ctx.db
      .from("collection_items")
      .select(ITEM_COLUMNS)
      .eq("workspace_id", wsId)
      .eq("collection_id", collectionId)
      .order("added_at", { ascending: false })
      .order("content_item_id", { ascending: true })
      .range(from, to),
  );
  const summaries = await loadContentSummaries(ctx, wsId, members.map((m) => m.content_item_id));
  const items: CollectionItemView[] = members.flatMap((member) => {
    const content = summaries.get(member.content_item_id)?.summary;
    return content ? [{ ...toCollectionItem(member), content }] : [];
  });
  return { collection, items };
}

function nameTaken(name: string): RepositoryError {
  return new RepositoryError("already_exists", `“${name}” adlı bir koleksiyon zaten var.`);
}

export async function createCollection(ctx: SupabaseContext, wsId: string, input: CreateCollectionInput): Promise<Collection> {
  await requireWorkspace(ctx, wsId);
  const valid = parseCreateCollectionInput(input);
  const result = await ctx.db
    .from("collections")
    .insert({ workspace_id: wsId, name: valid.name, name_key: collectionNameKey(valid.name), description: valid.description ?? null })
    .select(COLLECTION_COLUMNS)
    .single();
  if (result.error?.code === "23505") throw nameTaken(valid.name);
  return toCollection(unwrap(result), 0);
}

async function requireCollection(ctx: SupabaseContext, wsId: string, collectionId: string): Promise<CollectionRow> {
  const row = isUuid(collectionId)
    ? unwrap(await ctx.db.from("collections").select(COLLECTION_COLUMNS).eq("workspace_id", wsId).eq("id", collectionId).maybeSingle())
    : null;
  if (!row) throw new RepositoryError("not_found", `Koleksiyon bulunamadı: ${collectionId}`);
  return row;
}

/** Kendi adına (harf büyüklüğü dahil) yeniden adlandırmak serbesttir; başka koleksiyonun adı → `already_exists`. */
export async function renameCollection(ctx: SupabaseContext, wsId: string, collectionId: string, name: string): Promise<Collection> {
  await requireWorkspace(ctx, wsId);
  await requireCollection(ctx, wsId, collectionId);
  const valid = parseCollectionName(name);
  const result = await ctx.db
    .from("collections")
    .update({ name: valid, name_key: collectionNameKey(valid) })
    .eq("workspace_id", wsId)
    .eq("id", collectionId)
    .select(COLLECTION_SELECT)
    .maybeSingle<CountedCollectionRow>();
  if (result.error?.code === "23505") throw nameTaken(valid);
  const row = unwrap(result);
  if (!row) throw new RepositoryError("not_found", `Koleksiyon bulunamadı: ${collectionId}`);
  return toCountedCollection(row);
}

/** Koleksiyonu ve üyeliklerini siler (cascade); içerikler silinmez. Yoksa `not_found`. */
export async function deleteCollection(ctx: SupabaseContext, wsId: string, collectionId: string): Promise<void> {
  await requireWorkspace(ctx, wsId);
  const deleted = isUuid(collectionId)
    ? unwrap(await ctx.db.from("collections").delete().eq("workspace_id", wsId).eq("id", collectionId).select("id"))
    : [];
  if (deleted.length === 0) throw new RepositoryError("not_found", `Koleksiyon bulunamadı: ${collectionId}`);
}

/** Koleksiyonun `updated_at`'ını şimdiye çeker (`set_updated_at` trigger'ı değeri yazar). */
async function touchCollection(ctx: SupabaseContext, wsId: string, collectionId: string, name: string): Promise<void> {
  unwrap(await ctx.db.from("collections").update({ name }).eq("workspace_id", wsId).eq("id", collectionId));
}

/**
 * İDEMPOTENT ekleme: zaten üyeyse yeni kayıt açılmaz (`addedAt` korunur); `note` verilirse günceller ("" siler),
 * verilmezse dokunmaz. Koleksiyon ya da içerik yoksa `not_found`; not ≤ 500 karakter (`invalid_input`).
 */
export async function addToCollection(ctx: SupabaseContext, wsId: string, collectionId: string, contentId: string, note?: string): Promise<CollectionItem> {
  await requireWorkspace(ctx, wsId);
  const collection = await requireCollection(ctx, wsId, collectionId);
  const content = isUuid(contentId) ? unwrap(await ctx.db.from("content_items").select("id").eq("workspace_id", wsId).eq("id", contentId).maybeSingle()) : null;
  if (!content) throw new RepositoryError("not_found", `İçerik bulunamadı: ${contentId}`);
  const validNote = parseCollectionNote(note);

  const readMember = async () =>
    unwrap(await ctx.db.from("collection_items").select(ITEM_COLUMNS).eq("workspace_id", wsId).eq("collection_id", collectionId).eq("content_item_id", contentId).maybeSingle());
  let existing: CollectionItemRow | null = await readMember();
  if (!existing) {
    const inserted = await ctx.db
      .from("collection_items")
      .insert({ collection_id: collectionId, content_item_id: contentId, workspace_id: wsId, note: validNote ? validNote : null })
      .select(ITEM_COLUMNS)
      .single();
    if (inserted.error?.code !== "23505") return toCollectionItem(unwrap(inserted));
    existing = await readMember(); // eşzamanlı ekleme kazandı: idempotent
    if (!existing) throw new RepositoryError("not_found", `İçerik bulunamadı: ${contentId}`);
  }
  if (validNote !== undefined && validNote !== (existing.note ?? "")) {
    existing = unwrap(
      await ctx.db
        .from("collection_items")
        .update({ note: validNote === "" ? null : validNote })
        .eq("workspace_id", wsId)
        .eq("collection_id", collectionId)
        .eq("content_item_id", contentId)
        .select(ITEM_COLUMNS)
        .single(),
    );
    await touchCollection(ctx, wsId, collectionId, collection.name);
  }
  return toCollectionItem(existing);
}

/** Çıkarma idempotent: üye değilse sessizce döner; koleksiyon yoksa `not_found`. */
export async function removeFromCollection(ctx: SupabaseContext, wsId: string, collectionId: string, contentId: string): Promise<void> {
  await requireWorkspace(ctx, wsId);
  await requireCollection(ctx, wsId, collectionId);
  if (!isUuid(contentId)) return;
  unwrap(await ctx.db.from("collection_items").delete().eq("workspace_id", wsId).eq("collection_id", collectionId).eq("content_item_id", contentId));
}

/** İçerik hangi koleksiyonlarda (en son güncellenen önce). Bilinmeyen içerik/workspace → boş liste. */
export async function listCollectionsForContent(ctx: SupabaseContext, wsId: string, contentId: string): Promise<Collection[]> {
  if (!isUuid(wsId) || !isUuid(contentId)) return [];
  const members = unwrap(await ctx.db.from("collection_items").select("collection_id").eq("workspace_id", wsId).eq("content_item_id", contentId));
  return readCounted(ctx, wsId, members.map((m) => m.collection_id));
}

/**
 * Toplu üyelik TEK okumayla: her istenen kimlik anahtardır (üye olmayan/bilinmeyen `[]`), değerler koleksiyon kimlikleri,
 * `listCollectionsForContent` ile aynı sırada. Biçimsiz (UUID olmayan) kimlik hiçbir koleksiyonda olamaz: `[]`.
 */
export async function listCollectionMembership(ctx: SupabaseContext, wsId: string, contentIds: string[]): Promise<Record<string, string[]>> {
  const wanted = parseMembershipContentIds(contentIds);
  const result: Record<string, string[]> = Object.fromEntries(wanted.map((id) => [id, [] as string[]]));
  const valid = onlyUuids(wanted);
  if (!isUuid(wsId) || valid.length === 0) return result;

  type Membership = { content_item_id: string; collections: Pick<CollectionRow, "id" | "name" | "updated_at"> | null };
  const rows = await fetchAllRows((from, to) =>
    ctx.db
      .from("collection_items")
      .select("content_item_id, collections!inner(id, name, updated_at)")
      .eq("workspace_id", wsId)
      .in("content_item_id", valid)
      .order("content_item_id", { ascending: true })
      .order("collection_id", { ascending: true })
      .range(from, to)
      .overrideTypes<Membership[], { merge: false }>(),
  );
  const byContent = new Map<string, Pick<CollectionRow, "id" | "name" | "updated_at">[]>();
  for (const row of rows) {
    if (row.collections) byContent.set(row.content_item_id, [...(byContent.get(row.content_item_id) ?? []), row.collections]);
  }
  for (const [contentId, collections] of byContent) result[contentId] = collections.sort(compareCollections).map((c) => c.id);
  return result;
}
