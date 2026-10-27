import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  addToCollectionAction,
  createCollectionAction,
  deleteCollectionAction,
  getContentCollectionsAction,
  removeFromCollectionAction,
  renameCollectionAction,
  updateCollectionItemNoteAction,
} from "@/app/actions/collections";
import { getPanelContext } from "@/lib/data";

/**
 * Action'lar + gerçek depo (varsayılan mock kaynak, `@/lib/data` üzerinden): zod → depo → Türkçe hata çevirisi zinciri.
 * Süit kendi oluşturduğu koleksiyonları siler (mock durumu süreç boyunca ortaktır).
 */
const created: string[] = [];
const unique = (label: string) => `Test ${label} ${Math.random().toString(36).slice(2, 8)}`;

async function makeCollection(name = unique("koleksiyon")) {
  const result = await createCollectionAction({ name });
  if (!result.ok) throw new Error(`oluşturulamadı: ${result.message}`);
  created.push(result.collection.id);
  return result.collection;
}

async function contentIds(count: number): Promise<string[]> {
  const { repo, wsId } = await getPanelContext();
  return (await repo.listContent(wsId, { limit: count })).items.map((item) => item.id);
}

afterEach(async () => {
  const { repo, wsId } = await getPanelContext();
  for (const id of created.splice(0)) {
    if (await repo.getCollection(wsId, id)) await repo.deleteCollection(wsId, id);
  }
});

describe("koleksiyon action'ları (mock depo ile)", () => {
  it("kaydet akışı: oluştur+kaydet → menü verisi işaretli → çıkar → işaret kalkar; ekleme idempotent", async () => {
    const [contentId] = await contentIds(1);
    const name = unique("kaydet");
    const first = await createCollectionAction({ name, contentId, note: "  açılış  " });
    if (!first.ok) throw new Error(first.message);
    created.push(first.collection.id);
    expect(first.saved).toBe(true);

    const menu = await getContentCollectionsAction({ contentId });
    expect(menu.ok && menu.memberIds).toContain(first.collection.id);
    expect(menu.ok && menu.collections.some((c) => c.id === first.collection.id && c.name === name)).toBe(true);

    // İdempotent: ikinci kez eklemek yinelenmez.
    expect((await addToCollectionAction({ collectionId: first.collection.id, contentId })).ok).toBe(true);
    const { repo, wsId } = await getPanelContext();
    const detail = await repo.getCollection(wsId, first.collection.id);
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0].note, "not verilmeyen ekleme notu korur").toBe("açılış");

    expect((await removeFromCollectionAction({ collectionId: first.collection.id, contentId })).ok).toBe(true);
    expect((await removeFromCollectionAction({ collectionId: first.collection.id, contentId })).ok, "çıkarma idempotent").toBe(true);
    const after = await getContentCollectionsAction({ contentId });
    expect(after.ok && after.memberIds).not.toContain(first.collection.id);
  });

  it("ad benzersizliği Türkçe İ/ı ve harf büyüklüğüne duyarsız; Türkçe mesaj döner", async () => {
    const base = unique("İlham Işık");
    await makeCollection(base);
    for (const clash of [base.toLocaleUpperCase("tr-TR"), base.toLocaleLowerCase("tr-TR"), `  ${base}  `]) {
      const result = await createCollectionAction({ name: clash });
      expect(result, clash).toMatchObject({ ok: false, code: "already_exists" });
      expect(result.ok === false && result.message).toMatch(/adlı bir koleksiyon zaten var\.$/);
    }
    const other = await makeCollection();
    expect(await renameCollectionAction({ collectionId: other.id, name: base.toLocaleUpperCase("tr-TR") })).toMatchObject({ ok: false, code: "already_exists" });
    // Kendi adına (harf büyüklüğü değişerek) yeniden adlandırma serbest.
    expect((await renameCollectionAction({ collectionId: other.id, name: `${other.name}!` })).ok).toBe(true);
  });

  it("not düzenleme: ekler/siler; çıkarılmış öğeyi geri eklemez; olmayan içerik/koleksiyon → not_found", async () => {
    const [contentId] = await contentIds(1);
    const collection = await makeCollection();
    const { repo, wsId } = await getPanelContext();

    // Üye değilken not düzenleme öğeyi EKLEMEZ.
    expect(await updateCollectionItemNoteAction({ collectionId: collection.id, contentId, note: "not" })).toMatchObject({ ok: false, code: "not_found" });
    expect((await repo.getCollection(wsId, collection.id))?.items).toHaveLength(0);

    await addToCollectionAction({ collectionId: collection.id, contentId });
    expect((await updateCollectionItemNoteAction({ collectionId: collection.id, contentId, note: " düzenlendi " })).ok).toBe(true);
    expect((await repo.getCollection(wsId, collection.id))?.items[0].note).toBe("düzenlendi");
    expect((await updateCollectionItemNoteAction({ collectionId: collection.id, contentId, note: "" })).ok).toBe(true);
    expect((await repo.getCollection(wsId, collection.id))?.items[0].note).toBeUndefined();

    expect(await addToCollectionAction({ collectionId: collection.id, contentId: "ci_yok" })).toMatchObject({ ok: false, code: "not_found" });
    expect(await addToCollectionAction({ collectionId: "col_yok", contentId })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("silme: koleksiyon ve üyelikleri gider, içerik durur; ikinci silme not_found", async () => {
    const [contentId] = await contentIds(1);
    const collection = await makeCollection();
    await addToCollectionAction({ collectionId: collection.id, contentId });

    expect(await deleteCollectionAction({ collectionId: collection.id })).toEqual({ ok: true, message: "Koleksiyon silindi." });
    const { repo, wsId } = await getPanelContext();
    expect(await repo.getCollection(wsId, collection.id)).toBeNull();
    expect(await repo.getContent(wsId, contentId), "içerik silinmez").not.toBeNull();
    expect(await deleteCollectionAction({ collectionId: collection.id })).toMatchObject({ ok: false, code: "not_found" });
  });
});
