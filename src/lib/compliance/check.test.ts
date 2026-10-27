import { describe, expect, it } from "vitest";

import { checkCompliance, complianceFailureMessage } from "@/lib/compliance";
import { CAPTION_TRUNCATION_APPROX, DISCLOSURE_WINDOW } from "@/lib/compliance/normalize";
import type { ComplianceInput } from "@/lib/domain/compliance";

/** Tam `n` kod noktalık dolgu; sonu boşluk (ardından gelen ibare ayrı kelime olur). */
const pad = (n: number) => `${"a".repeat(n - 1)} `;

const base: ComplianceInput = { caption: "", isPaidPartnership: false, isAiGenerated: false, region: "TR" };
const run = (over: Partial<ComplianceInput>) => checkCompliance({ ...base, ...over });
const ruleIds = (over: Partial<ComplianceInput>) => run(over).findings.map((f) => f.ruleId);

describe("checkCompliance · genel", () => {
  it("işaretsiz içerikte hiçbir kural uygulanmaz: ok", () => {
    for (const region of ["TR", "US", "TR_US"] as const) {
      expect(run({ region, caption: "Günün ipucu #verimlilik" })).toEqual({ status: "ok", findings: [] });
    }
  });

  it("saf: aynı girdi aynı sonucu verir ve girdiyi değiştirmez", () => {
    const input: ComplianceInput = { ...base, isPaidPartnership: true, caption: "Merhaba" };
    const before = structuredClone(input);
    expect(checkCompliance(input)).toEqual(checkCompliance(input));
    expect(input).toEqual(before);
  });

  it("fail, warn'dan baskındır; bulgular kural sırasıyla gelir; her bulguda mesaj var", () => {
    const result = run({ isPaidPartnership: true, isAiGenerated: true, caption: "Merhaba" });
    expect(result.status).toBe("fail");
    expect(result.findings.map((f) => [f.ruleId, f.severity])).toEqual([
      ["tr.ad-label", "fail"],
      ["tr.advertiser", "warn"],
      ["tr.ai-disclosure", "fail"],
    ]);
    expect(result.findings.every((f) => f.message.length > 0)).toBe(true);
  });

  it("yalnız warn bulgusu varsa durum warn (engel yok)", () => {
    const result = run({ isPaidPartnership: true, caption: "Reklam · yeni ürün" });
    expect(result.status).toBe("warn");
    expect(ruleIds({ isPaidPartnership: true, caption: "Reklam · yeni ürün" })).toEqual(["tr.advertiser"]);
    expect(complianceFailureMessage(result), "warn yayını engellemez").toBeUndefined();
  });

  it("açıklama yok (boş / tanımsız): ibare yok sayılır", () => {
    expect(ruleIds({ isPaidPartnership: true })).toContain("tr.ad-label");
    expect(ruleIds({ isPaidPartnership: true, caption: undefined as unknown as string })).toContain("tr.ad-label");
  });
});

describe("checkCompliance · TR ücretli iş birliği ibaresi", () => {
  const paid = (caption: string, advertiserName?: string) => run({ isPaidPartnership: true, caption, advertiserName });
  const label = (caption: string) => paid(caption).findings.some((f) => f.ruleId === "tr.ad-label");

  it("ilk satırda Reklam / Tanıtım varsa geçer (büyük-küçük harf ve Türkçe İ/ı duyarlı)", () => {
    for (const caption of [
      "Reklam · harika ürün",
      "REKLAM",
      "reklam",
      "Tanıtım: yeni kahve",
      "TANITIM",
      "TANİTİM", // noktalı İ ile yazılmış
      "tanitim",
      "#reklam #işbirliği",
      "(Reklam) merhaba",
      "REKLAMDIR",
      "Tanıtımdır bu",
    ]) {
      expect(label(caption), caption).toBe(false);
    }
  });

  it("baştaki boş satırlar sayılmaz: görünen ilk satır bakılır", () => {
    expect(label("\n\n  Reklam · ürün\nikinci satır")).toBe(false);
  });

  it("pencere ilk satır değil, ilk 100 kod noktasıdır: ikinci satırda ama pencerede olan ibare geçer", () => {
    expect(label("Harika ürün\nReklam")).toBe(false);
    expect(label("Harika ürün\nReklam\nüçüncü satır")).toBe(false);
  });

  it("ibare pencerenin dışındaysa ya da hiç yoksa fail (sınır: 100. kod noktası)", () => {
    expect(label(`${pad(DISCLOSURE_WINDOW - "Reklam".length)}Reklam`), "tam sınırda biter: geçer").toBe(false);
    expect(label(`${pad(DISCLOSURE_WINDOW - "Reklam".length + 1)}Reklam`), "bir kod noktası taşar: kesilir").toBe(true);
    expect(label(`${pad(DISCLOSURE_WINDOW)}Reklam`)).toBe(true);
    expect(paid(`${pad(DISCLOSURE_WINDOW)}\nReklam`).status).toBe("fail");
    expect(label("Harika ürün #işbirliği")).toBe(true);
  });

  it("pencere kod noktası sayar (emoji iki birim olsa da bir sayılır); baştaki boşluklar sayılmaz", () => {
    expect(label(`${"😀".repeat(DISCLOSURE_WINDOW - "Reklam".length)}Reklam`)).toBe(false);
    expect(label(`${"😀".repeat(DISCLOSURE_WINDOW - "Reklam".length + 1)}Reklam`)).toBe(true);
    expect(label(`\n\n   ${pad(DISCLOSURE_WINDOW - "Reklam".length)}Reklam`)).toBe(false);
  });

  it("mesaj ve ipucu pencereyi tek sabitten söyler (100 / yaklaşık 125)", () => {
    const finding = paid("Merhaba").findings.find((f) => f.ruleId === "tr.ad-label");
    expect(finding?.message).toContain(`ilk ${DISCLOSURE_WINDOW} karakter`);
    expect(finding?.hint).toContain(String(CAPTION_TRUNCATION_APPROX));
  });

  it("olumsuz ibare sayılmaz: “Reklam değil”, “Tanıtım değildir” (Türkçe büyük harf dahil)", () => {
    for (const caption of ["Reklam değil, samimi tavsiye", "REKLAM DEĞİL", "Tanıtım değildir", "TANİTİM DEĞİLDİR", "#reklam değil", "reklam  değil"]) {
      expect(label(caption), caption).toBe(true);
    }
    // Aynı pencerede gerçek ibare de varsa geçer; “reklam” + başka kelime olumsuz değildir.
    expect(label("Reklam değil diyenlere inat: Reklam · yeni ürün")).toBe(false);
    expect(label("Reklam · değil mi?")).toBe(true);
    expect(label("Reklam, değişim odaklı")).toBe(false);
  });

  it("benzeyen ama ibare olmayan sözcükler geçmez (reklamcılık, sanitim)", () => {
    expect(label("Reklamcılık ipuçları")).toBe(true);
    expect(label("Sanitim bilgi")).toBe(true);
    expect(label("İş birliği")).toBe(true);
  });

  it("ücretli iş birliği işaretli değilse ibare aranmaz", () => {
    expect(run({ caption: "Harika ürün" }).status).toBe("ok");
  });
});

describe("checkCompliance · TR reklam veren", () => {
  const advertiserFinding = (caption: string, advertiserName?: string) =>
    run({ isPaidPartnership: true, caption, advertiserName }).findings.find((f) => f.ruleId === "tr.advertiser");

  it("reklam veren adı açıklamada geçiyorsa (büyük-küçük harf ve Türkçe harf duyarsız) uyarı yok", () => {
    expect(advertiserFinding("Reklam · KAHVECİ Ltd ile", "Kahveci Ltd")).toBeUndefined();
    expect(advertiserFinding("Reklam · Işık Kahve ile", "IŞIK KAHVE")).toBeUndefined();
  });

  it("“@… tarafından sağlandı” kalıbı yeter", () => {
    expect(advertiserFinding("Reklam · @kahveci tarafından sağlandı")).toBeUndefined();
    expect(advertiserFinding("TANITIM\nÜrün @markam TARAFINDAN SAĞLANDI.")).toBeUndefined();
  });

  it("reklam veren adı KELİME olarak aranır: “Ece” adı “gecelik” içinde sayılmaz", () => {
    expect(advertiserFinding("Reklam · yeni gecelik koleksiyonu", "Ece")?.severity).toBe("warn");
    expect(advertiserFinding("Reklam · Ecemsu ile", "Ece")?.severity).toBe("warn");
    expect(advertiserFinding("Reklam · Ece ile", "ECE")).toBeUndefined();
    expect(advertiserFinding("Reklam · @ece ile", "Ece")).toBeUndefined();
    expect(advertiserFinding("Reklam · Ece'nin yeni ürünü", "Ece")).toBeUndefined();
    expect(advertiserFinding("Reklam · Ece Ltd. ile", "Ece Ltd.")).toBeUndefined();
    expect(advertiserFinding("Reklam · C+ ürünü", "C+")).toBeUndefined();
    expect(advertiserFinding("Reklam · yeni ürün", "  ")?.severity).toBe("warn");
  });

  it("ad girilmiş ama açıklamada yoksa ya da hiç ad yoksa warn (fail değil)", () => {
    expect(advertiserFinding("Reklam · yeni ürün", "Kahveci Ltd")?.severity).toBe("warn");
    expect(advertiserFinding("Reklam · yeni ürün")?.severity).toBe("warn");
  });
});

describe("checkCompliance · TR yapay zekâ beyanı", () => {
  const ai = (caption: string) => run({ isAiGenerated: true, caption });

  it("açık beyan varsa geçer (Türkçe büyük harf, ek ve YZ kısaltması dahil)", () => {
    for (const caption of [
      "Yapay zekâ ile üretildi",
      "Bu video yapay zekâ ile üretilmiştir.",
      "YAPAY ZEKÂ İLE ÜRETİLDİ",
      "YZ ile üretildi",
      "yz ile oluşturuldu",
      "Görseller yapay zeka ile hazırlandı",
      "Yapay zekâ tarafından üretildi",
      "yapay   zekâ\nile üretildi",
      "Yapay zekâ ile tamamen üretildi",
      "Yapay zekâ üretimi içerik",
    ]) {
      expect(ai(caption).status, caption).toBe("ok");
    }
  });

  it("olumsuz cümle beyan değildir: “üretilmedi”, “oluşturulmamıştır”, “yapılmadı”, “kullanılmadı”", () => {
    for (const caption of [
      "Yapay zekâ ile üretilmedi",
      "YAPAY ZEKÂ İLE ÜRETİLMEDİ",
      "Bu video yapay zekâ ile oluşturulmamıştır.",
      "YZ ile yapılmadı",
      "Yapay zekâ tarafından hazırlanmadı",
      "Yapay zekâ ile kurgulanmamıştır",
      "Yapay zekâ ile geliştirilmedi",
      "Yapay zekâ ile üretilemedi",
      "Yapay zekâ ile hiç üretilmedi",
      "Yapay zekâ kullanılmadı",
      "Yapay zekâ ile değil elle üretildi",
      "Yapay zekâ üretimi değil",
      "YAPAY ZEKÂ ÜRÜNÜ DEĞİLDİR",
    ]) {
      const result = ai(caption);
      expect(result.status, caption).toBe("fail");
      expect(result.findings.map((f) => f.ruleId)).toEqual(["tr.ai-disclosure"]);
    }
  });

  it("olumsuz cümlenin yanında gerçek beyan varsa geçer; olumlu ekler (-mış, -di, -erek) eşleşir", () => {
    expect(ai("Sesi gerçek. Yapay zekâ ile üretilmedi ama görseller yapay zekâ ile üretildi").status).toBe("ok");
    for (const caption of ["Yapay zekâ ile üretilmiştir", "YZ ile oluşturulmuştur", "Yapay zekâ ile hazırlanmıştır", "Yapay zekâ ile yapıldı", "Yapay zekâ tarafından üretilerek paylaşıldı", "Yapay zekâ kullanılarak üretildi"]) {
      expect(ai(caption).status, caption).toBe("ok");
    }
  });

  it("beyan yoksa fail; yalnız hashtag ya da alakasız 'yapay zekâ' geçmesi beyan sayılmaz", () => {
    for (const caption of ["", "Harika video", "#yapayzeka #ai", "Yapay zekâ hakkında konuşuyoruz", "MAİL gönder"]) {
      const result = ai(caption);
      expect(result.status, caption).toBe("fail");
      expect(result.findings.map((f) => f.ruleId)).toEqual(["tr.ai-disclosure"]);
    }
  });
});

describe("checkCompliance · US (FTC)", () => {
  const paid = (caption: string) => run({ region: "US", isPaidPartnership: true, caption });
  const ai = (caption: string) => run({ region: "US", isAiGenerated: true, caption });

  it("ilk 100 karakterde #ad / #sponsored / Sponsored / Paid partnership / (Ad) / “Ad ·” varsa geçer", () => {
    for (const caption of [
      "#ad Loving this coffee",
      "Loving this coffee #ad",
      "Loving this coffee\n#ad",
      "#sponsored",
      "#paidpartnership",
      "Ad · new drop",
      "AD | new drop",
      "Ad - new drop",
      "  Ad — new drop",
      "Ad",
      "(Ad) new drop",
      "New drop [ad]",
      "Sponsored by Acme",
      "SPONSORED",
      "Paid partnership with @acme",
      "paid partnership",
      "Advertisement",
      "Not sponsored by them, but Sponsored by Acme",
    ]) {
      expect(paid(caption).status, caption).toBe("ok");
    }
  });

  it("olumsuz kalıplar, “Ad:” biçimi ve benzer sözcükler beyan sayılmaz (fail)", () => {
    for (const caption of [
      "Loving this coffee #add",
      "Ads are everywhere",
      "",
      "Reklam",
      "Not sponsored, just love it",
      "not sponsored",
      "NOT SPONSORED",
      "Not an ad",
      "This is not an ad",
      "No ad here",
      "Non-sponsored review",
      "Not a paid partnership",
      "Ad-free morning",
      "ad free week",
      "Bu duyguya bir ad koyalım",
      "Ad: Ayşe",
      "AD: new drop",
      "AD 2026",
      "Ad2026",
      "Send me an ad-hoc plan",
    ]) {
      const result = paid(caption);
      expect(result.status, caption).toBe("fail");
      expect(result.findings.map((f) => f.ruleId)).toEqual(["us.paid-disclosure"]);
    }
  });

  it("pencere ilk satır değil ilk 100 kod noktasıdır: dışında kalan ibare fail, sınırda biten geçer", () => {
    expect(paid(`${pad(DISCLOSURE_WINDOW - "#ad".length)}#ad`).status).toBe("ok");
    expect(paid(`${pad(DISCLOSURE_WINDOW - "#ad".length + 1)}#ad`).status).toBe("fail");
    expect(paid(`${pad(DISCLOSURE_WINDOW)}\n#ad`).status).toBe("fail");
    expect(paid(`${"😀".repeat(DISCLOSURE_WINDOW - "#ad".length)}#ad`).status).toBe("ok");
    expect(paid(`${"😀".repeat(DISCLOSURE_WINDOW - "#ad".length + 1)}#ad`).status).toBe("fail");
  });

  it("mesaj pencereyi tek sabitten söyler", () => {
    const finding = paid("Hello").findings[0];
    expect(finding?.message).toContain(`ilk ${DISCLOSURE_WINDOW} karakter`);
    expect(finding?.hint).toContain(String(CAPTION_TRUNCATION_APPROX));
  });

  it("TR kuralları US bölgesinde uygulanmaz (ücretli iş birliği + YZ)", () => {
    expect(run({ region: "US", isPaidPartnership: true, isAiGenerated: true, caption: "#ad AI-generated" }).status).toBe("ok");
    expect(ai("Yapay zekâ ile üretildi").findings.map((f) => f.ruleId)).toEqual(["us.ai-disclosure"]);
  });

  it("YZ beyanı yoksa warn (fail değil); AI-generated / made with AI varsa geçer", () => {
    const missing = ai("Nice video");
    expect(missing.status).toBe("warn");
    expect(missing.findings[0]).toMatchObject({ ruleId: "us.ai-disclosure", severity: "warn" });
    for (const caption of ["AI-generated", "ai generated visuals", "Made with AI", "made with ai", "Created using AI", "#aigenerated"]) {
      expect(ai(caption).status, caption).toBe("ok");
    }
  });
});

describe("checkCompliance · bölge", () => {
  const input: Omit<ComplianceInput, "region"> = { caption: "Reklam · ürün @marka tarafından sağlandı", isPaidPartnership: true, isAiGenerated: false };

  it("TR: yalnız TR kuralları; US: yalnız US kuralları; TR_US: ikisi birden", () => {
    expect(checkCompliance({ ...input, region: "TR" }).status).toBe("ok");
    expect(checkCompliance({ ...input, region: "US" }).findings.map((f) => f.ruleId)).toEqual(["us.paid-disclosure"]);
    expect(checkCompliance({ ...input, region: "TR_US" }).findings.map((f) => f.ruleId)).toEqual(["us.paid-disclosure"]);
    const both = checkCompliance({ ...input, region: "TR_US", caption: "Reklam #ad @marka tarafından sağlandı" });
    expect(both).toEqual({ status: "ok", findings: [] });
  });

  it("TR_US'de iki bölgenin bulguları birlikte gelir", () => {
    const result = checkCompliance({ ...input, region: "TR_US", caption: "Merhaba", isAiGenerated: true });
    expect(result.findings.map((f) => f.ruleId)).toEqual(["tr.ad-label", "tr.advertiser", "tr.ai-disclosure", "us.paid-disclosure", "us.ai-disclosure"]);
  });

  it("bilinmeyen bölge (tip dışı veri) en sıkı davranır: iki bölgenin kuralları uygulanır", () => {
    const result = checkCompliance({ ...input, region: "EU" as unknown as "TR", caption: "Merhaba" });
    expect(result.findings.map((f) => f.ruleId)).toContain("us.paid-disclosure");
    expect(result.findings.map((f) => f.ruleId)).toContain("tr.ad-label");
  });
});

describe("complianceFailureMessage", () => {
  it("fail bulgularını tek Türkçe metinde toplar", () => {
    const message = complianceFailureMessage(run({ isPaidPartnership: true, isAiGenerated: true, caption: "Merhaba" }));
    expect(message).toMatch(/^Uyum denetimi başarısız:/);
    expect(message).toContain("Reklam");
    expect(message).toContain("Yapay zekâ ile üretilmiş");
  });

  it("ok sonucunda undefined", () => {
    expect(complianceFailureMessage(run({ caption: "x" }))).toBeUndefined();
  });
});
