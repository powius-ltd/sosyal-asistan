import { describe, expect, it } from "vitest";

import { createFakeLlm } from "@/lib/llm/backend-fake";
import { reviewScript, SCRIPT_REVIEW_PROMPT_VERSION, type ScriptReviewInput } from "@/lib/llm/script-review";
import { CLAIMS_CAPPED_NOTE, finalizeReview, reviewProblems, type ScriptReviewContext } from "@/lib/llm/script-review-validate";
import { CLAIMS_MAX, type RawScriptReview } from "@/lib/llm/script-review-schema";

const SCRIPT =
  "Osmanlı İmparatorluğu 1453 yılında İstanbul'u fethetti ve bu olay çağı kapatıp yeni çağı açtı. Bugün bile o dönemden kalan surların önünde durup kendine şunu sor: ben neyi erteliyorum? Yarın bir şeyi bitir ve bana yaz.";
const FIXED =
  "Osmanlı Devleti 1453 yılında İstanbul'u fethetti ve bu olay orta çağı kapatıp yeni çağı açtı. Bugün bile o dönemden kalan surların önünde durup kendine şunu sor: ben neyi erteliyorum? Yarın bir şeyi bitir ve bana yaz.";
const input = (over: Partial<ScriptReviewInput> = {}): ScriptReviewInput => ({ title: "Erteleme", script: SCRIPT, language: "tr", targetDurationSec: 40, evidenceQuotes: [], personalQuotes: [], ...over });
const ctx = (quotes: string[] = [], over: Partial<ScriptReviewContext> = {}): ScriptReviewContext => ({ script: SCRIPT, quotes, language: "tr", rivalTexts: [], ...over });
const raw = (over: Partial<RawScriptReview> = {}): RawScriptReview => ({ revisedScript: SCRIPT, changes: [], claims: [], ...over });

describe("reviewProblems", () => {
  it("özgün metin + boş iddia temiz", () => {
    expect(reviewProblems(raw(), ctx([]))).toEqual([]);
  });

  it("kelime sayısı ±%25 dışına çıkarsa sorun", () => {
    expect(reviewProblems(raw({ revisedScript: "Çok kısa bir senaryo oldu artık ama yine de yirmi karakterden uzun." }), ctx([])).join("\n")).toContain("kelime sayısı");
  });

  it("özgünde birebir geçen alıntı revizede kaybolursa sorun; yeni sayı eklenirse sorun (yanlış iddia yoksa)", () => {
    const quote = "ben neyi erteliyorum";
    expect(reviewProblems(raw({ revisedScript: SCRIPT.replace(quote, "ne erteliyorum") }), ctx([quote])).join("\n")).toContain("aynen korunmalı");
    expect(reviewProblems(raw({ revisedScript: SCRIPT.replace("1453", "1454") }), ctx([])).join("\n")).toContain("olmayan sayı");
  });

  it("iddia parçası özgünden birebir olmalı; wrong iddia revizede durmamalı", () => {
    expect(reviewProblems(raw({ claims: [{ text: "uydurma bir cümle", verdict: "ok", note: "Doğru." }] }), ctx([])).join("\n")).toContain("birebir alınmamış");
    const stillThere = raw({ claims: [{ text: "çağı kapatıp yeni çağı açtı", verdict: "wrong", note: "Orta çağı kapattı." }] });
    expect(reviewProblems(stillThere, ctx([])).join("\n")).toContain("hâlâ duruyor");
  });
});

describe("reviewScript", () => {
  it("wrong iddia → senaryo değişir, düzeltme sayısı ve not review'da", async () => {
    const llm = createFakeLlm(raw({
      revisedScript: FIXED,
      changes: ["Yazı dilindeki 'İmparatorluğu' konuşma diline çevrildi"],
      claims: [{ text: "Osmanlı İmparatorluğu 1453 yılında İstanbul'u fethetti", verdict: "wrong", note: "Doğrusu: Osmanlı Devleti; devlet adı düzeltildi." }],
    }));
    const out = await reviewScript(llm.backend, input());
    expect(out.problems).toEqual([]);
    expect(out.script).toBe(FIXED);
    expect(out.script).not.toBe(SCRIPT);
    expect(out.review).toMatchObject({ revised: true, originalScript: SCRIPT, corrections: 2, verifyBeforePublish: [], promptVersion: SCRIPT_REVIEW_PROMPT_VERSION });
    expect(out.review?.claims[0]).toMatchObject({ verdict: "wrong", note: expect.stringContaining("Osmanlı Devleti") });
    expect(out.meta).toMatchObject({ kind: "llm_week_synthesis", billing: "subscription" });
  });

  it("uncertain iddia → 'yayından önce doğrula' listesi; senaryo aynı kalır", async () => {
    const llm = createFakeLlm(raw({ claims: [{ text: "1453 yılında İstanbul'u fethetti", verdict: "uncertain", note: "Tarihi tekrar kontrol et." }] }));
    const out = await reviewScript(llm.backend, input());
    expect(out.script).toBe(SCRIPT);
    expect(out.review).toMatchObject({ revised: false, corrections: 0 });
    expect(out.review?.verifyBeforePublish).toEqual(['"1453 yılında İstanbul\'u fethetti" — Tarihi tekrar kontrol et.']);
  });

  it("denetimden geçmeyen çıktı: tek tur kuralı (B10) — ikinci LLM çağrısı YOK, review yok ve özgün senaryo", async () => {
    const bad = raw({ revisedScript: SCRIPT.replace("1453", "1454") });
    const llm = createFakeLlm(bad, bad);
    const out = await reviewScript(llm.backend, input());
    expect(llm.calls).toHaveLength(1);
    expect(out.meta.attempts).toBe(1);
    expect(out.review).toBeUndefined();
    expect(out.script).toBe(SCRIPT);
    expect(out.problems.join("\n")).toContain("olmayan sayı");
  });

  it("istem: protected bloğu, zanaat blokları ve web yok uyarısı", async () => {
    const llm = createFakeLlm(raw());
    await reviewScript(llm.backend, input({ evidenceQuotes: ["bir alıntı"], personalQuotes: ["kişisel olgu"] }));
    const system = llm.calls[0].args?.join("\n") ?? "";
    expect(system).toContain("NO web access");
    expect(system).toContain("SPOKEN TURKISH");
    expect(llm.calls[0].input).toContain("kişisel olgu");
  });
});

describe("finalizeReview", () => {
  it("özgün metin yalnız değiştiyse saklanır", () => {
    expect(finalizeReview(raw(), SCRIPT, "v").originalScript).toBeUndefined();
    expect(finalizeReview(raw({ revisedScript: FIXED }), SCRIPT, "v").originalScript).toBe(SCRIPT);
  });

  it("B5: iddia sayısı tavana (CLAIMS_MAX) ulaşınca 'kalan iddialar denetlenmedi' satırı doğrula listesine girer; altındayken girmez", () => {
    const claims = (n: number): RawScriptReview["claims"] => Array.from({ length: n }, () => ({ text: "Osmanlı İmparatorluğu 1453 yılında İstanbul'u fethetti", verdict: "ok" as const, note: "Doğru." }));
    expect(finalizeReview(raw({ claims: claims(CLAIMS_MAX) }), SCRIPT, "v").verifyBeforePublish).toEqual([CLAIMS_CAPPED_NOTE]);
    expect(finalizeReview(raw({ claims: claims(CLAIMS_MAX - 1) }), SCRIPT, "v").verifyBeforePublish).toEqual([]);
  });

  it("B7: yalnız boşluk farkı değişiklik sayılmaz; yalnız harf (Türkçe karakter) düzeltmesi değişiklik sayılır", () => {
    expect(finalizeReview(raw({ revisedScript: `  ${SCRIPT.replace(" bu olay ", "   bu\nolay ")}  ` }), SCRIPT, "v")).toMatchObject({ revised: false });
    const plain = "Osmanli Imparatorlugu 1453 yilinda Istanbul'u fethetti ve bu olay cagi kapatip yeni cagi acti. Bugun bile o donemden kalan surlarin onunde durup kendine sunu sor: ben neyi erteliyorum? Yarin bir seyi bitir ve bana yaz.";
    const review = finalizeReview(raw({ revisedScript: SCRIPT, changes: ["Türkçe karakterler düzeltildi"] }), plain, "v");
    expect(review).toMatchObject({ revised: true, originalScript: plain, corrections: 1 });
  });
});
