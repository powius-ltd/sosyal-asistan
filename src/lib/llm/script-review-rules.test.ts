/** B1: editörün düzelttiği senaryo, fikir denetiminin senaryo kurallarından (kopya, dil, yeni kişisel olgu) yeniden geçer. */
import { describe, expect, it } from "vitest";

import { createFakeLlm } from "@/lib/llm/backend-fake";
import { reviewScript, type ScriptReviewInput } from "@/lib/llm/script-review";
import { reviewProblems, type ScriptReviewContext } from "@/lib/llm/script-review-validate";
import type { RawScriptReview } from "@/lib/llm/script-review-schema";
import { newPersonalFactProblems, personalPastMarkers } from "@/lib/llm/script-personal-facts";
import { maxSharedWithRivals, rivalTexts } from "@/lib/llm/script-rules";

const SCRIPT =
  "Osmanlı İmparatorluğu 1453 yılında İstanbul'u fethetti ve bu olay çağı kapatıp yeni çağı açtı. Bugün bile o dönemden kalan surların önünde durup kendine şunu sor: ben neyi erteliyorum? Yarın bir şeyi bitir ve bana yaz.";
const EN =
  "Most people wait for the perfect moment to start. The truth is that the moment never comes by itself. Pick one small task today and finish it before dinner, then tell me how it went.";
const raw = (revisedScript: string, over: Partial<RawScriptReview> = {}): RawScriptReview => ({ revisedScript, changes: [], claims: [], ...over });
const ctx = (over: Partial<ScriptReviewContext> = {}): ScriptReviewContext => ({ script: SCRIPT, quotes: [], language: "tr", rivalTexts: [], ...over });
const text = (problems: string[]): string => problems.join("\n");

const RIVAL = "Hiçbir şey kendi kendine bitmez ama sen her sabah ilk işi yaparsan günün yarısı bile gelmeden rahatlarsın";
const COPIED = SCRIPT.replace("Yarın bir şeyi bitir ve bana yaz.", "her sabah ilk işi yaparsan günün yarısı bile gelmeden rahatlarsın.");

describe("B1 kopya: rakip metniyle ≥ 8 ardışık kelime", () => {
  it("revize metin rakipten 8+ kelime taşırsa sorun; taşımazsa temiz", () => {
    const rivals = [{ id: "r1", text: RIVAL }];
    expect(text(reviewProblems(raw(COPIED), ctx({ rivalTexts: rivals })))).toMatch(/kopya: .*r1.*10 kelimelik/);
    expect(reviewProblems(raw(SCRIPT), ctx({ rivalTexts: rivals }))).toEqual([]);
    expect(reviewProblems(raw(COPIED), ctx())).toEqual([]); // rakip metni yoksa kopya yok
  });

  it("7 kelimelik ortak dizi sınırın altında kalır (sınır 8)", () => {
    const seven = SCRIPT.replace("Yarın bir şeyi bitir ve bana yaz.", "her sabah ilk işi yaparsan günün yarısı gelir.");
    expect(reviewProblems(raw(seven), ctx({ rivalTexts: [{ id: "r1", text: RIVAL }] }))).toEqual([]);
  });

  it("reviewScript: kopyalı düzeltme atılır, özgün senaryo kalır, ikinci çağrı yok", async () => {
    const llm = createFakeLlm(raw(COPIED), raw(COPIED));
    const input: ScriptReviewInput = { title: "t", script: SCRIPT, language: "tr", targetDurationSec: 40, evidenceQuotes: [], personalQuotes: [], rivalTexts: [{ id: "r1", text: RIVAL }] };
    const out = await reviewScript(llm.backend, input);
    expect(out.review).toBeUndefined();
    expect(out.script).toBe(SCRIPT);
    expect(llm.calls).toHaveLength(1);
    expect(text(out.problems)).toContain("kopya");
  });

  it("istem: rakip alıntıları <context> içinde yalnız bağlam (korunmaz, kopyalanmaz); <protected> yalnız kişisel olgular", async () => {
    const llm = createFakeLlm(raw(SCRIPT));
    await reviewScript(llm.backend, { title: "t", script: SCRIPT, language: "tr", evidenceQuotes: ["rakip alıntısı"], personalQuotes: ["kişisel olgu"] });
    const system = llm.calls[0].args?.join("\n") ?? "";
    const payload = llm.calls[0].input ?? "";
    expect(system).toContain("never copy");
    expect(system).toContain("8 or more consecutive words");
    expect(system).not.toContain("rival quotes in <protected>");
    expect(payload).toMatch(/<protected>[\s\S]*kişisel olgu[\s\S]*<\/protected>/);
    expect(payload).toMatch(/<context>[\s\S]*rakip alıntısı[\s\S]*<\/context>/);
    expect(payload.match(/<protected>[\s\S]*<\/protected>/)?.[0]).not.toContain("rakip alıntısı");
  });
});

describe("B1 dil: en içerikte Türkçe harf yok", () => {
  it("en revizede ı/ş/ğ/İ sorun; tr'de sorun değil", () => {
    const withTurkish = EN.replace("dinner", "dınner");
    expect(text(reviewProblems(raw(withTurkish), ctx({ script: EN, language: "en" })))).toContain("Türkçe harf");
    expect(reviewProblems(raw(EN), ctx({ script: EN, language: "en" }))).toEqual([]);
    expect(text(reviewProblems(raw(SCRIPT), ctx()))).not.toContain("Türkçe harf");
  });
});

describe("B1 yeni kişisel olgu yok", () => {
  it("tr: birinci tekil geçmiş zaman anlatısı eklenirse sorun (yeni işaret)", () => {
    const added = SCRIPT.replace("Yarın bir şeyi bitir ve bana yaz.", "Ben geçen yıl bunu yaptım, sen de yarın bitir.");
    expect(text(reviewProblems(raw(added), ctx()))).toMatch(/kişisel anlatı.*yaptim/);
  });

  it("tr: özgünde zaten geçen işaret sorun değil; 'adım', 'tutum' gibi isimler yanlış pozitif vermez", () => {
    const original = "Dün ofiste çok yoruldum ama bugün yeniden başlıyorum. Bu benim ilk adımım ve doğru tutum bu. Sen de bir şeyi bitir ve bana yaz, olur mu, çünkü bu kolay değil.";
    expect([...personalPastMarkers(original, "tr")]).toEqual(["yoruldum"]);
    expect(newPersonalFactProblems(original, original.replace("çok", "gerçekten"), "tr", "")).toEqual([]);
    expect(newPersonalFactProblems(original, `${original} Bu adım önemli, bu tutum da.`, "tr", "")).toEqual([]);
  });

  it("en: 'I went' eklenirse sorun; 'I need', 'I proceed' fiilleri ve özgündeki işaret sorun değil", () => {
    expect(text(reviewProblems(raw(EN.replace("then tell me how it went", "I lost my job last year too")), ctx({ script: EN, language: "en" })))).toMatch(/kişisel anlatı.*i lost/);
    expect(newPersonalFactProblems(EN, EN.replace("Pick", "I need you to pick"), "en", "")).toEqual([]);
    expect(newPersonalFactProblems(EN, EN.replace("Pick", "I proceed to pick"), "en", "")).toEqual([]);
    const withPast = `${EN} I started small.`;
    expect(newPersonalFactProblems(withPast, withPast.replace("small", "slowly"), "en", "")).toEqual([]);
  });

  it("yeni özel ad (cümle ortasında büyük harfli, özgünde yok) sorun; cümle başı ve özgündeki ad sorun değil", () => {
    const added = SCRIPT.replace("kendine şunu sor", "kendine Ahmet Hoca gibi şunu sor");
    expect(text(reviewProblems(raw(added), ctx()))).toMatch(/özel ad.*Ahmet/);
    const sameName = SCRIPT.replace("Bugün bile", "Bugün bile İstanbul'da");
    expect(reviewProblems(raw(sameName), ctx())).toEqual([]);
    expect(reviewProblems(raw(SCRIPT.replace("Yarın", "Sonra yarın")), ctx())).toEqual([]);
  });

  it("wrong notunda geçen ad serbest (düzeltmenin doğrusu); notta yoksa aynı ad sorun", () => {
    const fixed = SCRIPT.replace("Osmanlı İmparatorluğu", "Osmanlı Devleti");
    const claim = { text: "Osmanlı İmparatorluğu 1453 yılında İstanbul'u fethetti", verdict: "wrong" as const };
    expect(reviewProblems(raw(fixed, { claims: [{ ...claim, note: "Doğrusu: Osmanlı Devleti." }] }), ctx())).toEqual([]);
    expect(text(reviewProblems(raw(fixed, { claims: [{ ...claim, note: "Düzelttim." }] }), ctx()))).toMatch(/özel ad.*Devleti/);
  });
});

describe("script-rules yardımcıları", () => {
  it("rivalTexts kendi içerikleri atlar, boşları saymaz; maxSharedWithRivals en çok paylaşılan kaynağı verir", () => {
    const rivals = rivalTexts([
      { id: "own", isOwn: true, transcript: RIVAL },
      { id: "r1", isOwn: false, transcript: RIVAL, caption: "  " },
      { id: "r2", isOwn: false, hookText: "tamamen başka bir metin burada" },
    ]);
    expect(rivals.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(maxSharedWithRivals([COPIED], rivals)).toMatchObject({ maxSharedWords: 10, copiedFrom: "r1" });
    expect(maxSharedWithRivals([SCRIPT], [])).toEqual({ maxSharedWords: 0, copiedFrom: undefined });
  });
});
