"use server";

/**
 * Koleksiyon mutasyonları ve "Kaydet" menüsünün okuması (server action). Action'lar doğrudan POST ile
 * çağrılabildiği için: girdi sunucuda zod ile doğrulanır (kurallar `collection-input.ts`'ten: depoyla aynı şema),
 * workspace istemciden ALINMAZ (`getPanelContext()`), depo hatası ortak yardımcıyla Türkçe mesaja çevrilir.
 * Rakip videosu saklanmaz: koleksiyon yalnız içerik kimliği + not tutar.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toCollectionOption, type CollectionOption } from "@/components/collections/collection-option";
import { actionFail, actionOk, toActionError, validationFail, type ActionFailure, type ActionResult } from "@/lib/actions/result";
import { collectionNameSchema, collectionNoteSchema, createCollectionSchema } from "@/lib/data/collection-input";
import { getPanelContext, type PanelContext } from "@/lib/data";
import { ROUTES } from "@/lib/routes";

const idSchema = z.string({ error: "Geçersiz istek." }).trim().min(1, "Geçersiz istek.").max(128, "Geçersiz istek.");

const contentInput = z.object({ contentId: idSchema });
const createInput = createCollectionSchema.extend({ contentId: idSchema.optional(), note: collectionNoteSchema });
const renameInput = z.object({ collectionId: idSchema, name: collectionNameSchema });
const collectionInput = z.object({ collectionId: idSchema });
const addInput = z.object({ collectionId: idSchema, contentId: idSchema, note: collectionNoteSchema });
const removeInput = z.object({ collectionId: idSchema, contentId: idSchema });
const noteInput = z.object({ collectionId: idSchema, contentId: idSchema, note: collectionNoteSchema.unwrap() });

/** Başarıda kullanıcıya gösterilecek metin de döner (toast). */
export type CollectionActionResult = ActionResult<{ message: string }>;
export type ContentCollectionsResult = ActionResult<{ collections: CollectionOption[]; memberIds: string[] }>;
export type CreateCollectionResult = ActionResult<{ message: string; collection: CollectionOption; saved: boolean }>;

const NOT_FOUND_COLLECTION = "Koleksiyon bulunamadı; silinmiş olabilir. Sayfayı yenile.";
const NOT_FOUND_ANY = "Koleksiyon ya da içerik bulunamadı; silinmiş olabilir. Sayfayı yenile.";

/** Koleksiyon değişince etkilenen sayfalar: liste/ayrıntı, Tutanlar (Kaydet düğmesi), Video analizi (Kaydet düğmesi). */
function revalidateCollectionPages(): void {
  revalidatePath(ROUTES.collections);
  revalidatePath(ROUTES.outliers);
  revalidatePath("/video/[id]", "page");
}

const isFailure = (value: object): value is ActionFailure => "ok" in value && value.ok === false;

/**
 * Ortak iskelet: bağlamı çöz, işi yap, sayfaları yenile, hatayı Türkçeye çevir. `work` beklenen bir ret durumunda
 * (ör. "öğe artık koleksiyonda değil") doğrudan `actionFail(...)` döndürebilir.
 */
async function mutate<T extends object>(
  work: (ctx: PanelContext) => Promise<T | ActionFailure>,
  overrides: Parameters<typeof toActionError>[1] = {},
): Promise<ActionResult<T>> {
  try {
    const data = await work(await getPanelContext());
    if (isFailure(data)) {
      if (data.code === "not_found") revalidateCollectionPages();
      return data;
    }
    revalidateCollectionPages();
    return actionOk(data);
  } catch (error) {
    const failure = toActionError(error, overrides);
    // Ekran eskimiş olabilir (koleksiyon başka sekmede silinmiş): güncel listeyi göstermesi için yeniden çiz.
    if (failure.code === "not_found") revalidateCollectionPages();
    return failure;
  }
}

/**
 * "Kaydet" menüsü açılınca: tüm koleksiyonlar + bu içeriğin üye olduğu koleksiyon kimlikleri. Salt okur,
 * sayfa yenilemez.
 */
export async function getContentCollectionsAction(input: unknown): Promise<ContentCollectionsResult> {
  const parsed = contentInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  try {
    const { repo, wsId } = await getPanelContext();
    const [collections, memberOf] = await Promise.all([
      repo.listCollections(wsId),
      repo.listCollectionsForContent(wsId, parsed.data.contentId),
    ]);
    return actionOk({ collections: collections.map(toCollectionOption), memberIds: memberOf.map((c) => c.id) });
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Koleksiyon oluşturur. `contentId` verilirse (Kaydet menüsünde "Yeni koleksiyon") içerik de hemen eklenir
 * (isteğe bağlı `note` ile). Ekleme başarısız olursa koleksiyon yine de oluşmuştur: mesaj bunu söyler.
 */
export async function createCollectionAction(input: unknown): Promise<CreateCollectionResult> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Koleksiyon bilgileri geçersiz.");
  const { name, description, contentId, note } = parsed.data;

  const progress: { createdName?: string } = {};
  const result = await mutate(
    async ({ repo, wsId }) => {
      const collection = await repo.createCollection(wsId, { name, description });
      progress.createdName = collection.name;
      if (contentId) await repo.addToCollection(wsId, collection.id, contentId, note);
      return {
        collection: toCollectionOption(collection),
        saved: Boolean(contentId),
        message: contentId
          ? `“${collection.name}” koleksiyonu oluşturuldu ve içerik kaydedildi.`
          : `“${collection.name}” koleksiyonu oluşturuldu.`,
      };
    },
    { already_exists: `“${name}” adlı bir koleksiyon zaten var.` },
  );
  if (!result.ok && progress.createdName) {
    revalidateCollectionPages(); // koleksiyon oluştu; listeler eskimesin
    return actionFail(`“${progress.createdName}” koleksiyonu oluşturuldu ama içerik eklenemedi. ${result.message}`, result.code);
  }
  return result;
}

export async function renameCollectionAction(input: unknown): Promise<CollectionActionResult> {
  const parsed = renameInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Koleksiyon adı geçersiz.");
  const { collectionId, name } = parsed.data;
  return mutate(
    async ({ repo, wsId }) => {
      const collection = await repo.renameCollection(wsId, collectionId, name);
      return { message: `Koleksiyon “${collection.name}” olarak yeniden adlandırıldı.` };
    },
    { not_found: NOT_FOUND_COLLECTION, already_exists: `“${name}” adlı bir koleksiyon zaten var.` },
  );
}

/** Koleksiyonu ve üyeliklerini siler; kaydedilen içerikler (videolar) silinmez. */
export async function deleteCollectionAction(input: unknown): Promise<CollectionActionResult> {
  const parsed = collectionInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  return mutate(
    async ({ repo, wsId }) => {
      await repo.deleteCollection(wsId, parsed.data.collectionId);
      return { message: "Koleksiyon silindi." };
    },
    { not_found: NOT_FOUND_COLLECTION },
  );
}

/** İçeriği koleksiyona ekler (idempotent: zaten üyeyse yinelenmez). `note` "" ise notu siler, verilmezse dokunmaz. */
export async function addToCollectionAction(input: unknown): Promise<CollectionActionResult> {
  const parsed = addInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Not geçersiz.");
  const { collectionId, contentId, note } = parsed.data;
  return mutate(
    async ({ repo, wsId }) => {
      await repo.addToCollection(wsId, collectionId, contentId, note);
      return { message: "İçerik koleksiyona eklendi." };
    },
    { not_found: NOT_FOUND_ANY },
  );
}

/** İçeriği koleksiyondan çıkarır (idempotent: üye değilse sessizce başarılı). */
export async function removeFromCollectionAction(input: unknown): Promise<CollectionActionResult> {
  const parsed = removeInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { collectionId, contentId } = parsed.data;
  return mutate(
    async ({ repo, wsId }) => {
      await repo.removeFromCollection(wsId, collectionId, contentId);
      return { message: "İçerik koleksiyondan çıkarıldı." };
    },
    { not_found: NOT_FOUND_COLLECTION },
  );
}

/**
 * Koleksiyondaki bir öğenin notunu değiştirir ("" siler). Depo `addToCollection` üyeyse yalnız notu günceller, ama
 * üye değilse YENİ EKLER; başka sekmede çıkarılmış bir öğenin notu yüzünden geri eklenmesin diye önce üyelik doğrulanır.
 */
export async function updateCollectionItemNoteAction(input: unknown): Promise<CollectionActionResult> {
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "Not geçersiz.");
  const { collectionId, contentId, note } = parsed.data;
  return mutate(
    async ({ repo, wsId }) => {
      const detail = await repo.getCollection(wsId, collectionId);
      if (!detail) return actionFail(NOT_FOUND_COLLECTION, "not_found");
      if (!detail.items.some((item) => item.contentId === contentId)) {
        return actionFail("Bu içerik artık koleksiyonda değil. Sayfayı yenile.", "not_found");
      }
      await repo.addToCollection(wsId, collectionId, contentId, note);
      return { message: note === "" ? "Not silindi." : "Not kaydedildi." };
    },
    { not_found: NOT_FOUND_ANY },
  );
}
