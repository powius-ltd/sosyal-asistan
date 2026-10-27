import { describe, expect, it } from "vitest";

import { COLLECTION_DESCRIPTION_MAX, COLLECTION_NAME_MAX, COLLECTION_NOTE_MAX, collectionNameKey } from "@/lib/domain/collection";
import { parseCollectionName, parseCollectionNote, parseCreateCollectionInput } from "@/lib/data/collection-input";

const invalid = expect.objectContaining({ code: "invalid_input" });

describe("collectionNameKey", () => {
  it("Türkçe İ/ı, büyük-küçük harf, aksan ve boşluk farkını yok sayar", () => {
    const key = collectionNameKey("İlham Işık");
    for (const same of ["ilham ışık", "İLHAM IŞIK", "  ilham   isik ", "Ilham Isik"]) expect(collectionNameKey(same), same).toBe(key);
    expect(collectionNameKey("İlham")).not.toBe(collectionNameKey("İlham 2"));
  });
});

describe("koleksiyon girdisi", () => {
  it("adı kırpar; boş açıklamayı yok sayar; sınırlar kod noktası sayar", () => {
    expect(parseCreateCollectionInput({ name: "  Hook ilhamı ", description: "   " })).toEqual({ name: "Hook ilhamı", description: undefined });
    expect(parseCreateCollectionInput({ name: "A", description: " kısa " }).description).toBe("kısa");
    expect(parseCollectionName("\u{1F600}".repeat(COLLECTION_NAME_MAX))).toHaveLength(COLLECTION_NAME_MAX * 2);
  });

  it("boş/uzun/metin olmayan ad ve uzun açıklama invalid_input", () => {
    for (const name of ["", "  ", "x".repeat(COLLECTION_NAME_MAX + 1), 1, null, undefined]) {
      expect(() => parseCollectionName(name), String(name)).toThrowError(invalid);
    }
    expect(() => parseCreateCollectionInput({ name: "A", description: "x".repeat(COLLECTION_DESCRIPTION_MAX + 1) })).toThrowError(invalid);
    expect(() => parseCreateCollectionInput(null)).toThrowError(invalid);
  });

  it("not: undefined = dokunma, boş metin = sil, dolu metin kırpılır; uzun not invalid_input", () => {
    expect(parseCollectionNote(undefined)).toBeUndefined();
    expect(parseCollectionNote("   ")).toBe("");
    expect(parseCollectionNote("  not ")).toBe("not");
    expect(() => parseCollectionNote("x".repeat(COLLECTION_NOTE_MAX + 1))).toThrowError(invalid);
    expect(() => parseCollectionNote(5)).toThrowError(invalid);
  });
});
