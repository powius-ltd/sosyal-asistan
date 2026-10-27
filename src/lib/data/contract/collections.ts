/**
 * Sözleşme parçası: koleksiyonlar ("Kaydet"). Temizlik: test kendi oluşturduğu koleksiyonları siler; özgün
 * koleksiyonlara ekleme yapmaz (yalnız kendi koleksiyonuna içerik ekler/çıkarır).
 */
import { expect, it } from "vitest";

import {
  COLLECTION_DESCRIPTION_MAX,
  COLLECTION_MEMBERSHIP_IDS_MAX,
  COLLECTION_NAME_MAX,
  COLLECTION_NOTE_MAX,
  collectionNameKey,
} from "@/lib/domain/collection";
import { CONTENT_FORMATS, PLATFORMS } from "@/lib/domain/platform";
import type { PanelRepository } from "@/lib/data/repository";
import { expectCode, MISSING_ID, type ContractContext } from "@/lib/data/contract/support";

export function collectionsContract(ctx: ContractContext): void {
  const { wsId, foreign, create } = ctx;

  /** Testin oluşturduğu koleksiyonları izler; test sonunda `cleanup` siler. */
  function tracker(r: PanelRepository) {
    const created: string[] = [];
    const unique = (label: string) => `Sözleşme ${label} ${Date.now().toString(36)}${created.length}`;
    return {
      unique,
      async make(name: string, description?: string) {
        const collection = await r.createCollection(wsId, { name, description });
        created.push(collection.id);
        return collection;
      },
      async cleanup() {
        for (const id of created) {
          if (await r.getCollection(wsId, id)) await r.deleteCollection(wsId, id);
        }
      },
    };
  }

  async function someContentIds(r: PanelRepository, count: number): Promise<string[]> {
    const ids = (await r.listContent(wsId, { limit: count })).items.map((c) => c.id);
    if (ids.length < count) throw new Error(`seed: en az ${count} içerik gerekli`);
    return ids;
  }

  it("mevcut koleksiyonlar: alan kuralları, itemCount üyelerle tutarlı, içerik özeti dolu, sıralama updatedAt azalan", async () => {
    const r = create();
    const list = await r.listCollections(wsId);
    expect(list.length, "seed: en az bir koleksiyon").toBeGreaterThan(0);
    for (const c of list) {
      expect(c.workspaceId, c.id).toBe(wsId);
      expect(c.name.trim(), c.id).toBeTruthy();
      expect(c.updatedAt >= c.createdAt, c.id).toBe(true);
      const detail = await r.getCollection(wsId, c.id);
      if (!detail) throw new Error(`listede olan koleksiyon okunamadı: ${c.id}`);
      expect(detail.collection, c.id).toEqual(c);
      expect(c.itemCount, `${c.id}: itemCount üyelerin sayısı`).toBe(detail.items.length);
      for (const item of detail.items) {
        expect(item.collectionId).toBe(c.id);
        expect(item.content.contentItemId, "özet aynı içeriğe ait").toBe(item.contentId);
        expect(item.content.ownerHandle.trim()).toBeTruthy();
        expect(PLATFORMS).toContain(item.content.platform);
        expect(CONTENT_FORMATS).toContain(item.content.format);
        if (item.content.currentLift === undefined) expect(item.content.currentLift, "ölçülemeyen lift 0 yazılmaz").toBeUndefined();
        expect(item.note === undefined || item.note.trim().length > 0, "boş not tutulmaz").toBe(true);
      }
      const added = detail.items.map((i) => i.addedAt);
      expect(added, `${c.id}: öğeler yeniden eskiye`).toEqual([...added].sort((a, b) => b.localeCompare(a)));
      // Ters yön: içerik hangi koleksiyonlarda → bu koleksiyon da listede.
      for (const item of detail.items) {
        const owners = await r.listCollectionsForContent(wsId, item.contentId);
        expect(owners.map((x) => x.id), `${c.id}/${item.contentId}`).toContain(c.id);
      }
    }
    const updated = list.map((c) => c.updatedAt);
    expect(updated, "en son güncellenen önce").toEqual([...updated].sort((a, b) => b.localeCompare(a)));
    expect(await r.getCollection(wsId, MISSING_ID)).toBeNull();
    expect(await r.listCollectionsForContent(wsId, MISSING_ID)).toEqual([]);
  });

  it("yaşam döngüsü: oluştur (kırpılır, boş açıklama yok sayılır), yeniden adlandır, sil; ad değişince liste güncellenir", async () => {
    const r = create();
    const { make, unique, cleanup } = tracker(r);
    try {
      const before = (await r.listCollections(wsId)).length;
      const name = unique("yaşam");
      const created = await make(`  ${name}  `, "   ");
      expect(created).toMatchObject({ name, workspaceId: wsId, itemCount: 0 });
      expect(created.description, "boş açıklama undefined").toBeUndefined();
      expect((await r.listCollections(wsId)).length).toBe(before + 1);
      const detail = await r.getCollection(wsId, created.id);
      expect(detail?.items).toEqual([]);

      const withDescription = await make(unique("açıklamalı"), "  Kısa açıklama ");
      expect(withDescription.description).toBe("Kısa açıklama");

      const renamed = await r.renameCollection(wsId, created.id, `  ${name} 2 `);
      expect(renamed).toMatchObject({ id: created.id, name: `${name} 2`, itemCount: 0 });
      expect(renamed.updatedAt >= created.updatedAt).toBe(true);
      expect((await r.getCollection(wsId, created.id))?.collection.name).toBe(`${name} 2`);
      // Kendi adına (harf büyüklüğü değişerek) yeniden adlandırmak serbest.
      expect((await r.renameCollection(wsId, created.id, `${name} 2`.toLocaleUpperCase("tr-TR"))).name).toBe(`${name} 2`.toLocaleUpperCase("tr-TR"));

      await r.deleteCollection(wsId, created.id);
      expect(await r.getCollection(wsId, created.id)).toBeNull();
      expect((await r.listCollections(wsId)).some((c) => c.id === created.id)).toBe(false);
      await expectCode(r.deleteCollection(wsId, created.id), "not_found");
      await expectCode(r.renameCollection(wsId, created.id, "Artık yok"), "not_found");
    } finally {
      await cleanup();
    }
  });

  it("ad benzersiz: büyük-küçük harf ve Türkçe İ/ı duyarsız (already_exists); geçersiz ad/açıklama invalid_input", async () => {
    const r = create();
    const { make, unique, cleanup } = tracker(r);
    try {
      const base = `${unique("benzersiz")} İlham Işık`;
      const first = await make(base);
      for (const clash of [base.toLocaleUpperCase("tr-TR"), base.toLocaleLowerCase("tr-TR"), `  ${base}  `, base.replace(/ /g, "   ")]) {
        expect(collectionNameKey(clash), clash).toBe(collectionNameKey(base));
        await expectCode(r.createCollection(wsId, { name: clash }), "already_exists");
      }
      const second = await make(unique("ikinci"));
      await expectCode(r.renameCollection(wsId, second.id, base.toLocaleUpperCase("tr-TR")), "already_exists");
      expect((await r.getCollection(wsId, second.id))?.collection.name, "reddedilen ad uygulanmaz").toBe(second.name);
      // Silinen adın yeniden kullanılması serbest.
      await r.deleteCollection(wsId, first.id);
      const again = await make(base);
      expect(again.id).not.toBe(first.id);

      for (const name of ["", "   ", "x".repeat(COLLECTION_NAME_MAX + 1), 42 as unknown as string, undefined as unknown as string]) {
        await expectCode(r.createCollection(wsId, { name }), "invalid_input");
        await expectCode(r.renameCollection(wsId, second.id, name), "invalid_input");
      }
      await expectCode(r.createCollection(wsId, { name: unique("uzun-açıklama"), description: "x".repeat(COLLECTION_DESCRIPTION_MAX + 1) }), "invalid_input");
      // Tam sınır uzunluğunda ama BENZERSİZ ad (sabit ad kalıcı depoda ikinci koşuda already_exists verirdi).
      const longName = unique("sınır").padEnd(COLLECTION_NAME_MAX, "x");
      expect((await make(longName)).name).toHaveLength(COLLECTION_NAME_MAX);
    } finally {
      await cleanup();
    }
  });

  it("içerik ekleme İDEMPOTENT: tekrar ekleme yeni kayıt açmaz, addedAt korunur; not yalnız verilirse değişir", async () => {
    const r = create();
    const { make, unique, cleanup } = tracker(r);
    try {
      const [a, b] = await someContentIds(r, 2);
      const col = await make(unique("ekleme"));
      const first = await r.addToCollection(wsId, col.id, a);
      expect(first).toMatchObject({ collectionId: col.id, contentId: a });
      expect(first.note).toBeUndefined();

      const again = await r.addToCollection(wsId, col.id, a);
      expect(again, "tekrar ekleme aynı öğe").toEqual(first);
      expect((await r.getCollection(wsId, col.id))?.items).toHaveLength(1);
      expect((await r.listCollections(wsId)).find((c) => c.id === col.id)?.itemCount).toBe(1);

      const noted = await r.addToCollection(wsId, col.id, a, "  ilk not ");
      expect(noted).toMatchObject({ contentId: a, addedAt: first.addedAt, note: "ilk not" });
      expect((await r.addToCollection(wsId, col.id, a)).note, "not verilmezse dokunulmaz").toBe("ilk not");
      expect((await r.addToCollection(wsId, col.id, a, "")).note, "boş not siler").toBeUndefined();
      await expectCode(r.addToCollection(wsId, col.id, a, "x".repeat(COLLECTION_NOTE_MAX + 1)), "invalid_input");

      const second = await r.addToCollection(wsId, col.id, b, "ikinci");
      const detail = await r.getCollection(wsId, col.id);
      expect(detail?.collection.itemCount).toBe(2);
      expect(detail?.items.map((i) => i.contentId), "yeniden eskiye").toEqual([b, a]);
      expect(second.addedAt >= first.addedAt).toBe(true);
      expect((await r.listCollectionsForContent(wsId, a)).map((c) => c.id)).toContain(col.id);
    } finally {
      await cleanup();
    }
  });

  it("çıkarma idempotent; koleksiyon silinince üyelikleri de gider; olmayan koleksiyon/içerik not_found", async () => {
    const r = create();
    const { make, unique, cleanup } = tracker(r);
    try {
      const [a, b] = await someContentIds(r, 2);
      const col = await make(unique("çıkarma"));
      const other = await make(unique("diğer"));
      await r.addToCollection(wsId, col.id, a);
      await r.addToCollection(wsId, col.id, b);
      await r.addToCollection(wsId, other.id, a);
      expect((await r.listCollectionsForContent(wsId, a)).map((c) => c.id).sort()).toEqual([col.id, other.id].sort());

      await r.removeFromCollection(wsId, col.id, a);
      await r.removeFromCollection(wsId, col.id, a); // üye değil: sessiz
      expect((await r.getCollection(wsId, col.id))?.items.map((i) => i.contentId)).toEqual([b]);
      expect((await r.listCollectionsForContent(wsId, a)).map((c) => c.id)).toEqual([other.id]);

      await r.deleteCollection(wsId, other.id);
      expect(await r.listCollectionsForContent(wsId, a)).toEqual([]);
      expect((await r.listCollections(wsId)).find((c) => c.id === col.id)?.itemCount, "diğer koleksiyon etkilenmez").toBe(1);

      await expectCode(r.addToCollection(wsId, MISSING_ID, a), "not_found");
      await expectCode(r.addToCollection(wsId, col.id, MISSING_ID), "not_found");
      await expectCode(r.removeFromCollection(wsId, MISSING_ID, a), "not_found");
    } finally {
      await cleanup();
    }
  });

  it("toplu üyelik (listCollectionMembership): her istenen kimlik anahtar, tek tek okumayla aynı sonuç ve sıra; girdi doğrulanır", async () => {
    const r = create();
    const { make, unique, cleanup } = tracker(r);
    try {
      const [a, b, c] = await someContentIds(r, 3);
      const first = await make(unique("toplu-1"));
      const second = await make(unique("toplu-2"));
      await r.addToCollection(wsId, first.id, a);
      await r.addToCollection(wsId, second.id, a);
      await r.addToCollection(wsId, second.id, b);

      const ids = [a, b, c, a, MISSING_ID]; // tekrar + bilinmeyen içerik
      const membership = await r.listCollectionMembership(wsId, ids);
      expect(Object.keys(membership).sort(), "her istenen kimlik bir kez anahtar").toEqual([...new Set(ids)].sort());
      expect(membership[MISSING_ID], "bilinmeyen içerik: boş liste").toEqual([]);
      for (const id of new Set(ids)) {
        const single = (await r.listCollectionsForContent(wsId, id)).map((collection) => collection.id);
        expect(membership[id], `${id}: tek tek okumayla aynı sıra`).toEqual(single);
      }
      expect(membership[a]).toEqual(expect.arrayContaining([first.id, second.id]));
      expect(membership[b]).toContain(second.id);
      expect(membership[b]).not.toContain(first.id);

      // Çıkarma ve silme toplu sonuca yansır.
      await r.removeFromCollection(wsId, first.id, a);
      expect((await r.listCollectionMembership(wsId, [a]))[a]).not.toContain(first.id);
      await r.deleteCollection(wsId, second.id);
      const afterDelete = await r.listCollectionMembership(wsId, [a, b]);
      expect(afterDelete[a]).not.toContain(second.id);
      expect(afterDelete[b]).not.toContain(second.id);

      expect(await r.listCollectionMembership(wsId, []), "boş girdi: boş sonuç").toEqual({});
      expect(await r.listCollectionMembership(foreign, [a, b]), "bilinmeyen workspace: her kimlik boş").toEqual({ [a]: [], [b]: [] });

      const many = Array.from({ length: COLLECTION_MEMBERSHIP_IDS_MAX }, (_, i) => `yok-${i}`);
      expect(Object.keys(await r.listCollectionMembership(wsId, many))).toHaveLength(COLLECTION_MEMBERSHIP_IDS_MAX);
      await expectCode(r.listCollectionMembership(wsId, [...many, "fazla"]), "invalid_input");
      for (const bad of ["ci_1", null, undefined, [1], [""], [null], { a: 1 }]) {
        await expectCode(r.listCollectionMembership(wsId, bad as unknown as string[]), "invalid_input");
      }

      const copy = await r.listCollectionMembership(wsId, [a]);
      copy[a].push("bozuldu");
      expect((await r.listCollectionMembership(wsId, [a]))[a], "dönen nesne kopyadır").not.toContain("bozuldu");
    } finally {
      await cleanup();
    }
  });

  it("bilinmeyen workspace: okumalar boş/null, yazmalar not_found; dönen nesneler kopyadır", async () => {
    const r = create();
    const { make, unique, cleanup } = tracker(r);
    try {
      const [a] = await someContentIds(r, 1);
      const col = await make(unique("yabancı"));
      expect(await r.listCollections(foreign)).toEqual([]);
      expect(await r.getCollection(foreign, col.id)).toBeNull();
      expect(await r.listCollectionsForContent(foreign, a)).toEqual([]);
      await expectCode(r.createCollection(foreign, { name: "Yabancı" }), "not_found");
      await expectCode(r.renameCollection(foreign, col.id, "Yabancı"), "not_found");
      await expectCode(r.deleteCollection(foreign, col.id), "not_found");
      await expectCode(r.addToCollection(foreign, col.id, a), "not_found");
      await expectCode(r.removeFromCollection(foreign, col.id, a), "not_found");

      await r.addToCollection(wsId, col.id, a);
      const detail = await r.getCollection(wsId, col.id);
      if (!detail) throw new Error("koleksiyon okunamadı");
      detail.collection.name = "bozuldu";
      detail.items.length = 0;
      const fresh = await r.getCollection(wsId, col.id);
      expect(fresh?.collection.name).toBe(col.name);
      expect(fresh?.items).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
}
