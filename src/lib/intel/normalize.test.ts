import { describe, expect, it } from "vitest";

import { countWords, longestSharedWordRun, normalizeForMatch, wordTokens } from "@/lib/intel/normalize";

describe("normalizeForMatch", () => {
  it("NFKC: tam genişlikli harf/rakam ve üç nokta karakteri düz hale gelir", () => {
    expect(normalizeForMatch("ＨＥＬＬＯ １２３… wait")).toBe("hello 123... wait");
  });

  it("tipografik tırnaklar ve tire türleri düzleşir (kopya-yapıştır farkı alıntıyı bozmaz)", () => {
    expect(normalizeForMatch("Don’t stop — “believe”")).toBe(normalizeForMatch("Don't stop - \"believe\""));
    expect(normalizeForMatch("one–two‑three−four")).toBe("one-two-three-four");
    expect(normalizeForMatch("«merhaba»")).toBe('"merhaba"');
  });

  it("görünmez karakterler ve bölünemez boşluk atılır; boşluklar tek boşluk olur", () => {
    expect(normalizeForMatch("a​b­c﻿ d  e\n\tf")).toBe("abc d e f");
  });

  it("Türkçe İ/ı duyarlı katlama ve aksansızlaştırma", () => {
    expect(normalizeForMatch("İYİ Işık ÇAĞRI")).toBe("iyi isik cagri");
    expect(normalizeForMatch("TANITIM")).toBe(normalizeForMatch("Tanıtım"));
    expect(normalizeForMatch("TANİTİM")).toBe(normalizeForMatch("tanitim"));
  });

  it("noktalama silinmez (birebir alıntı kuralı)", () => {
    expect(normalizeForMatch("Stop. Listen, now!")).toBe("stop. listen, now!");
  });

  it("boş girdi → boş", () => {
    expect(normalizeForMatch("   ")).toBe("");
  });
});

describe("wordTokens / countWords", () => {
  it("kelime = harf/rakam dizisi; kesme işaretli kelime tek sayılır; yalnız noktalama/sembol kelime değildir", () => {
    expect(wordTokens("Don't stop — it's 2026 😀 ...")).toEqual(["don't", "stop", "it's", "2026"]);
    expect(countWords("♪ ♪ ♪ (alkış)")).toBe(1);
    expect(countWords("")).toBe(0);
  });

  it("Türkçe kelimeler doğru sayılır", () => {
    expect(countWords("Bugün üç şey öğreneceksin, hazır mısın?")).toBe(6);
  });
});

describe("longestSharedWordRun", () => {
  it("ortak ardışık kelime dizisinin uzunluğu (normalleştirilmiş; noktalama/büyük harf/tırnak farkı yok sayılır)", () => {
    const a = "You are not behind, you are exactly where you need to be right now.";
    const b = "She said: “Exactly where you need to be” — that is the point.";
    expect(longestSharedWordRun(a, b)).toBe(6); // "exactly where you need to be"
  });

  it("8 kelimelik kopya tespit edilir; 7'de kalmaz", () => {
    const source = "the quiet morning routine that changed my whole life forever";
    // the quiet morning routine that changed my whole = 8
    expect(longestSharedWordRun(source, "I love the quiet morning routine that changed my whole, truly")).toBe(8);
    // the quiet morning routine that changed my = 7 (sonraki kelime "skin" ≠ "whole")
    expect(longestSharedWordRun(source, "the quiet morning routine that changed my skin")).toBe(7);
  });

  it("hiç ortak kelime / boş metin → 0", () => {
    expect(longestSharedWordRun("alpha beta", "gamma delta")).toBe(0);
    expect(longestSharedWordRun("", "gamma")).toBe(0);
    expect(longestSharedWordRun("gamma", "")).toBe(0);
  });

  it("ortak dizi ardışık olmalı: araya giren kelime diziyi böler", () => {
    expect(longestSharedWordRun("a b c d e", "a b x c d e")).toBe(3);
  });

  it("simetrik", () => {
    const a = "one two three four five six";
    const b = "zero two three four five seven";
    expect(longestSharedWordRun(a, b)).toBe(longestSharedWordRun(b, a));
  });
});
