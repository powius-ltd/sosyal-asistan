import { describe, expect, it } from "vitest";

import { containsWord, disclosureHeadOf, DISCLOSURE_WINDOW, foldTurkish, wordsOf } from "@/lib/compliance/normalize";

describe("foldTurkish", () => {
  it("Türkçe büyük harfler: İ→i, I→ı→i; aksanlar atılır", () => {
    expect(foldTurkish("TANITIM")).toBe("tanitim");
    expect(foldTurkish("TANİTİM")).toBe("tanitim");
    expect(foldTurkish("Tanıtım")).toBe("tanitim");
    expect(foldTurkish("YAPAY ZEKÂ İLE ÜRETİLDİ")).toBe("yapay zeka ile uretildi");
    expect(foldTurkish("Işık ŞÖLENİ çağrı")).toBe("isik soleni cagri");
  });

  it("JS varsayılan küçük harfinin bıraktığı birleşik noktayı bırakmaz", () => {
    expect(foldTurkish("İ")).toBe("i");
    expect(foldTurkish("İ")).toHaveLength(1);
  });
});

describe("disclosureHeadOf", () => {
  it("baştaki boşlukları atar ve ilk DISCLOSURE_WINDOW kod noktasını döndürür", () => {
    expect(DISCLOSURE_WINDOW).toBe(100);
    expect(disclosureHeadOf("\n \n  Reklam \r\nikinci")).toBe("Reklam \r\nikinci");
    expect(disclosureHeadOf("")).toBe("");
    expect(disclosureHeadOf("  \n\t")).toBe("");
    expect(disclosureHeadOf("abcdef", 3)).toBe("abc");
  });

  it("emoji bölünmez (kod noktası bazlı)", () => {
    expect(Array.from(disclosureHeadOf("😀".repeat(150)))).toHaveLength(DISCLOSURE_WINDOW);
    expect(disclosureHeadOf("a😀b", 2)).toBe("a😀");
  });
});

describe("containsWord", () => {
  it("kelime sınırıyla eşleşir; alt dizgi eşleşmez", () => {
    expect(containsWord("yeni gecelik", "ece")).toBe(false);
    expect(containsWord("ece ile", "ece")).toBe(true);
    expect(containsWord("@ece", "ece")).toBe(true);
    expect(containsWord("ece'nin", "ece")).toBe(true);
    expect(containsWord("ecem", "ece")).toBe(false);
    expect(containsWord("kahveci ltd ile", "kahveci ltd")).toBe(true);
  });

  it("boş ve özel karakterli ad güvenle işlenir", () => {
    expect(containsWord("abc", "")).toBe(false);
    expect(containsWord("c+ urunu", "c+")).toBe(true);
    expect(containsWord("(a|b)", "(a|b)")).toBe(true);
  });
});

describe("wordsOf", () => {
  it("noktalama ve # işaretlerini ayırıcı sayar", () => {
    expect(wordsOf("#reklam: yeni-ürün (test)")).toEqual(["reklam", "yeni", "ürün", "test"]);
  });
});
