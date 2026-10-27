import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, repo } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  repo: {
    listCollections: vi.fn(),
    listCollectionsForContent: vi.fn(),
    getCollection: vi.fn(),
    createCollection: vi.fn(),
    renameCollection: vi.fn(),
    deleteCollection: vi.fn(),
    addToCollection: vi.fn(),
    removeFromCollection: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath }));

vi.mock("@/lib/data", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/data")>();
  return { ...original, getPanelContext: async () => ({ repo, wsId: "ws_test", now: new Date(0) }) };
});

import {
  addToCollectionAction,
  createCollectionAction,
  deleteCollectionAction,
  getContentCollectionsAction,
  removeFromCollectionAction,
  renameCollectionAction,
  updateCollectionItemNoteAction,
} from "@/app/actions/collections";
import { RepositoryError } from "@/lib/data/repository";

const COLLECTION = { id: "col_1", workspaceId: "ws_test", name: "Hook ilhamı", itemCount: 0, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" };

beforeEach(() => {
  vi.resetAllMocks();
});

/** Koleksiyon değişince liste/ayrıntı, Tutanlar ve Video analizi (Kaydet düğmesi) yenilenir. */
function expectRevalidated() {
  expect(revalidatePath).toHaveBeenCalledWith("/koleksiyonlar");
  expect(revalidatePath).toHaveBeenCalledWith("/tutanlar");
  expect(revalidatePath).toHaveBeenCalledWith("/video/[id]", "page");
}

describe("getContentCollectionsAction", () => {
  it("koleksiyonları ve üyelik kimliklerini döndürür; yalnız gerekli alanlar istemciye gider, sayfa yenilenmez", async () => {
    repo.listCollections.mockResolvedValue([COLLECTION, { ...COLLECTION, id: "col_2", name: "Kurgu" }]);
    repo.listCollectionsForContent.mockResolvedValue([{ ...COLLECTION, id: "col_2", name: "Kurgu" }]);

    const result = await getContentCollectionsAction({ contentId: "ci_1" });

    expect(result).toEqual({
      ok: true,
      collections: [
        { id: "col_1", name: "Hook ilhamı" },
        { id: "col_2", name: "Kurgu" },
      ],
      memberIds: ["col_2"],
    });
    expect(repo.listCollectionsForContent).toHaveBeenCalledWith("ws_test", "ci_1");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("geçersiz girdiyi depoya gitmeden reddeder", async () => {
    for (const bad of [undefined, {}, { contentId: "" }, { contentId: 5 }, { contentId: "x".repeat(200) }, "saçma"]) {
      expect((await getContentCollectionsAction(bad)).ok, JSON.stringify(bad)).toBe(false);
    }
    expect(repo.listCollections).not.toHaveBeenCalled();
  });
});

describe("createCollectionAction", () => {
  it("adı kırpıp oluşturur ve sayfaları yeniler", async () => {
    repo.createCollection.mockResolvedValue(COLLECTION);
    const result = await createCollectionAction({ name: "  Hook ilhamı ", description: "  Açılış örnekleri " });
    expect(result).toEqual({ ok: true, message: "“Hook ilhamı” koleksiyonu oluşturuldu.", collection: { id: "col_1", name: "Hook ilhamı" }, saved: false });
    expect(repo.createCollection).toHaveBeenCalledWith("ws_test", { name: "Hook ilhamı", description: "Açılış örnekleri" });
    expect(repo.addToCollection).not.toHaveBeenCalled();
    expectRevalidated();
  });

  it("contentId verilirse içeriği notla birlikte ekler", async () => {
    repo.createCollection.mockResolvedValue(COLLECTION);
    repo.addToCollection.mockResolvedValue({});
    const result = await createCollectionAction({ name: "Hook ilhamı", contentId: "ci_1", note: " ilk cümle " });
    expect(result).toMatchObject({ ok: true, saved: true, message: "“Hook ilhamı” koleksiyonu oluşturuldu ve içerik kaydedildi." });
    expect(repo.addToCollection).toHaveBeenCalledWith("ws_test", "col_1", "ci_1", "ilk cümle");
  });

  it("aynı ad → Türkçe mesaj (already_exists); sayfa yenilenmez", async () => {
    repo.createCollection.mockRejectedValue(new RepositoryError("already_exists", "dup"));
    expect(await createCollectionAction({ name: "İlham" })).toEqual({ ok: false, code: "already_exists", message: "“İlham” adlı bir koleksiyon zaten var." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("koleksiyon oluşup ekleme başarısız olursa bunu söyler ve listeleri yeniler", async () => {
    repo.createCollection.mockResolvedValue(COLLECTION);
    repo.addToCollection.mockRejectedValue(new RepositoryError("not_found", "içerik yok"));
    const result = await createCollectionAction({ name: "Hook ilhamı", contentId: "ci_gone" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("“Hook ilhamı” koleksiyonu oluşturuldu ama içerik eklenemedi.");
    expectRevalidated();
  });

  it("geçersiz girdiyi (boş/uzun ad, uzun açıklama/not) depoya gitmeden reddeder", async () => {
    const results = await Promise.all([
      createCollectionAction({ name: "   " }),
      createCollectionAction({ name: "a".repeat(61) }),
      createCollectionAction({ name: "Ad", description: "a".repeat(301) }),
      createCollectionAction({ name: "Ad", contentId: "ci_1", note: "a".repeat(501) }),
      createCollectionAction({}),
      createCollectionAction(null),
    ]);
    for (const result of results) expect(result.ok).toBe(false);
    expect(results[0].ok === false && results[0].message).toBe("Koleksiyon adı boş olamaz.");
    expect(repo.createCollection).not.toHaveBeenCalled();
  });
});

describe("renameCollectionAction", () => {
  it("yeniden adlandırır ve yeniler", async () => {
    repo.renameCollection.mockResolvedValue({ ...COLLECTION, name: "Yeni ad" });
    expect(await renameCollectionAction({ collectionId: "col_1", name: " Yeni ad " })).toEqual({ ok: true, message: "Koleksiyon “Yeni ad” olarak yeniden adlandırıldı." });
    expect(repo.renameCollection).toHaveBeenCalledWith("ws_test", "col_1", "Yeni ad");
    expectRevalidated();
  });

  it("başka koleksiyonun adı → already_exists; silinmiş koleksiyon → not_found ve liste yenilenir", async () => {
    repo.renameCollection.mockRejectedValueOnce(new RepositoryError("already_exists", "dup"));
    expect(await renameCollectionAction({ collectionId: "col_1", name: "Kurgu" })).toMatchObject({ ok: false, code: "already_exists", message: "“Kurgu” adlı bir koleksiyon zaten var." });
    expect(revalidatePath).not.toHaveBeenCalled();

    repo.renameCollection.mockRejectedValueOnce(new RepositoryError("not_found", "yok"));
    expect(await renameCollectionAction({ collectionId: "col_1", name: "Kurgu" })).toMatchObject({ ok: false, code: "not_found" });
    expectRevalidated();
  });

  it("boş ad ve eksik kimlik reddedilir", async () => {
    expect((await renameCollectionAction({ collectionId: "col_1", name: " " })).ok).toBe(false);
    expect((await renameCollectionAction({ name: "Ad" })).ok).toBe(false);
    expect(repo.renameCollection).not.toHaveBeenCalled();
  });
});

describe("deleteCollectionAction", () => {
  it("siler ve yeniler; yoksa not_found mesajı verir", async () => {
    repo.deleteCollection.mockResolvedValueOnce(undefined);
    expect(await deleteCollectionAction({ collectionId: "col_1" })).toEqual({ ok: true, message: "Koleksiyon silindi." });
    expect(repo.deleteCollection).toHaveBeenCalledWith("ws_test", "col_1");
    expectRevalidated();

    repo.deleteCollection.mockRejectedValueOnce(new RepositoryError("not_found", "yok"));
    expect(await deleteCollectionAction({ collectionId: "col_1" })).toMatchObject({ ok: false, code: "not_found", message: expect.stringContaining("silinmiş olabilir") });
    expect((await deleteCollectionAction({ collectionId: "" })).ok).toBe(false);
  });
});

describe("addToCollectionAction / removeFromCollectionAction", () => {
  it("ekler: notu kırpar; not verilmezse undefined (dokunma), '' verilirse '' (sil) iletir", async () => {
    repo.addToCollection.mockResolvedValue({});
    await addToCollectionAction({ collectionId: "col_1", contentId: "ci_1", note: "  not  " });
    await addToCollectionAction({ collectionId: "col_1", contentId: "ci_1" });
    await addToCollectionAction({ collectionId: "col_1", contentId: "ci_1", note: "" });
    expect(repo.addToCollection.mock.calls).toEqual([
      ["ws_test", "col_1", "ci_1", "not"],
      ["ws_test", "col_1", "ci_1", undefined],
      ["ws_test", "col_1", "ci_1", ""],
    ]);
    expectRevalidated();
  });

  it("koleksiyon ya da içerik yoksa Türkçe not_found; 500 karakteri aşan not reddedilir", async () => {
    repo.addToCollection.mockRejectedValueOnce(new RepositoryError("not_found", "yok"));
    expect(await addToCollectionAction({ collectionId: "col_1", contentId: "ci_x" })).toMatchObject({ ok: false, code: "not_found", message: expect.stringContaining("bulunamadı") });
    repo.addToCollection.mockClear();
    expect((await addToCollectionAction({ collectionId: "col_1", contentId: "ci_1", note: "a".repeat(501) })).ok).toBe(false);
    expect((await addToCollectionAction({ collectionId: "col_1" })).ok).toBe(false);
    expect(repo.addToCollection).not.toHaveBeenCalled();
  });

  it("çıkarır (idempotent) ve yeniler", async () => {
    repo.removeFromCollection.mockResolvedValue(undefined);
    expect(await removeFromCollectionAction({ collectionId: "col_1", contentId: "ci_1" })).toEqual({ ok: true, message: "İçerik koleksiyondan çıkarıldı." });
    expect(repo.removeFromCollection).toHaveBeenCalledWith("ws_test", "col_1", "ci_1");
    expectRevalidated();
    expect((await removeFromCollectionAction({ collectionId: "col_1" })).ok).toBe(false);
  });
});

describe("updateCollectionItemNoteAction", () => {
  const detail = { collection: COLLECTION, items: [{ collectionId: "col_1", contentId: "ci_1", addedAt: "2026-09-02T00:00:00Z" }] };

  it("üye öğenin notunu günceller; '' notu siler", async () => {
    repo.getCollection.mockResolvedValue(detail);
    repo.addToCollection.mockResolvedValue({});
    expect(await updateCollectionItemNoteAction({ collectionId: "col_1", contentId: "ci_1", note: " yeni not " })).toEqual({ ok: true, message: "Not kaydedildi." });
    expect(repo.addToCollection).toHaveBeenLastCalledWith("ws_test", "col_1", "ci_1", "yeni not");
    expect(await updateCollectionItemNoteAction({ collectionId: "col_1", contentId: "ci_1", note: "" })).toEqual({ ok: true, message: "Not silindi." });
    expect(repo.addToCollection).toHaveBeenLastCalledWith("ws_test", "col_1", "ci_1", "");
    expectRevalidated();
  });

  it("öğe başka sekmede çıkarılmışsa geri EKLEMEZ (not_found + yenileme)", async () => {
    repo.getCollection.mockResolvedValue({ ...detail, items: [] });
    const result = await updateCollectionItemNoteAction({ collectionId: "col_1", contentId: "ci_1", note: "not" });
    expect(result).toMatchObject({ ok: false, code: "not_found", message: expect.stringContaining("artık koleksiyonda değil") });
    expect(repo.addToCollection).not.toHaveBeenCalled();
    expectRevalidated();
  });

  it("koleksiyon silinmişse not_found; not alanı zorunlu ve ≤ 500", async () => {
    repo.getCollection.mockResolvedValue(null);
    expect(await updateCollectionItemNoteAction({ collectionId: "col_1", contentId: "ci_1", note: "x" })).toMatchObject({ ok: false, code: "not_found" });
    expect((await updateCollectionItemNoteAction({ collectionId: "col_1", contentId: "ci_1" })).ok).toBe(false);
    expect((await updateCollectionItemNoteAction({ collectionId: "col_1", contentId: "ci_1", note: "a".repeat(501) })).ok).toBe(false);
  });
});

describe("hata sızdırmama", () => {
  it("beklenmeyen hatanın ayrıntısı istemciye gitmez", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    repo.deleteCollection.mockRejectedValue(new Error("db şifresi: hunter2"));
    const result = await deleteCollectionAction({ collectionId: "col_1" });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("hunter2");
    spy.mockRestore();
  });
});
