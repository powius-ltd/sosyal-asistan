import { describe, expect, it } from "vitest";

import { toContentLanguage } from "@/lib/domain/content-language";
import { DEFAULT_CONTENT_LANGUAGE, INFER_MIN_SAMPLES, resolveContentLanguage } from "@/lib/workspace/content-language";

describe("resolveContentLanguage: sıra ayar → çıkarım → uyum bölgesi → varsayılan", () => {
  it("ayar her şeyden önce gelir (çıkarım ve bölge çelişse bile)", () => {
    const out = resolveContentLanguage({ configured: "tr", ownContentLanguages: ["en", "en", "en", "en"], complianceRegion: "US" });
    expect(out).toMatchObject({ language: "tr", source: "setting" });
    expect(out.note).toContain("çalışma alanı ayarı");
  });

  it("ayar yoksa kendi transcript dillerinin çoğunluğu (≥ 3 örnek) bölgeden önce gelir", () => {
    const out = resolveContentLanguage({ ownContentLanguages: ["en", "en", "tr", "en"], complianceRegion: "TR" });
    expect(out).toMatchObject({ language: "en", source: "inferred" });
    expect(out.note).toContain("3'i");
    expect(out.note).toContain("4 kendi video");
  });

  it("dil kodu biçimleri (en-US, TR_tr, boşluk) birleşir; bilinmeyen/desteklenmeyen kodlar örnek sayılmaz", () => {
    expect(resolveContentLanguage({ ownContentLanguages: ["tr-TR", "TR_tr", " tr ", "und", "de", undefined, null] })).toMatchObject({ language: "tr", source: "inferred" });
    // 2 bilinen örnek + 5 desteklenmeyen: örnek sayısı 2 < 3, çıkarım yok.
    expect(resolveContentLanguage({ ownContentLanguages: ["tr", "tr", "und", "und", "de", "de", "fr"], complianceRegion: "US" })).toMatchObject({ language: "en", source: "region" });
  });

  it(`en az ${INFER_MIN_SAMPLES} örnek gerekir: 2 örnek çıkarım sayılmaz, uyum bölgesine düşer`, () => {
    const out = resolveContentLanguage({ ownContentLanguages: ["tr", "tr"], complianceRegion: "US" });
    expect(out).toMatchObject({ language: "en", source: "region" });
    expect(out.note).toContain("(2/3)");
  });

  it("çoğunluk kesin olmalı: eşitlik çıkarım sayılmaz", () => {
    const out = resolveContentLanguage({ ownContentLanguages: ["tr", "tr", "en", "en"], complianceRegion: "TR" });
    expect(out).toMatchObject({ language: "tr", source: "region" });
    expect(out.note).toContain("çoğunluk oluşturmuyor");
  });

  it("uyum bölgesi: TR → tr; US ve TR_US → en", () => {
    expect(resolveContentLanguage({ complianceRegion: "TR" })).toMatchObject({ language: "tr", source: "region" });
    expect(resolveContentLanguage({ complianceRegion: "US" })).toMatchObject({ language: "en", source: "region" });
    expect(resolveContentLanguage({ complianceRegion: "TR_US" })).toMatchObject({ language: "en", source: "region" });
  });

  it("hiçbiri yoksa varsayılan en", () => {
    expect(resolveContentLanguage({})).toMatchObject({ language: DEFAULT_CONTENT_LANGUAGE, source: "default" });
    expect(resolveContentLanguage({ ownContentLanguages: [] })).toMatchObject({ language: "en", source: "default" });
  });
});

describe("toContentLanguage", () => {
  it("birincil dil kodunu desteklenen dile eşler", () => {
    expect(toContentLanguage("en-US")).toBe("en");
    expect(toContentLanguage("TR")).toBe("tr");
    expect(toContentLanguage("und")).toBeUndefined();
    expect(toContentLanguage("")).toBeUndefined();
    expect(toContentLanguage(undefined)).toBeUndefined();
  });
});
