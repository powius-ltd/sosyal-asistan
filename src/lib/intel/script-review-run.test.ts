import { describe, expect, it, vi } from "vitest";

import { reviewPlannedScripts, SCRIPT_REVIEW_BUDGET_MS, type ScriptReviewDeps } from "@/lib/intel/script-review-run";
import type { PayloadIdea } from "@/lib/intel/plan-payload";
import { createFakeLlm } from "@/lib/llm/backend-fake";
import type { RivalTextSource } from "@/lib/llm/script-rules";
import type { RawScriptReview } from "@/lib/llm/script-review-schema";

const SCRIPT = "Osmanlı İmparatorluğu 1453 yılında İstanbul'u fethetti. Bugün bile o dönemden kalan surların önünde durup kendine şunu sor: ben neyi erteliyorum? Yarın bir şeyi bitir ve bana yaz.";
const FIXED = SCRIPT.replace("İmparatorluğu", "Devleti");
const idea = (title: string, position?: number): PayloadIdea => ({
  title,
  rationale: "Çünkü tuttu.",
  platform: "instagram",
  format: "short_video",
  hook_type: "bold_claim",
  hooks: ["a", "b", "c"],
  script_outline: [],
  rank_score: 1,
  rank_inputs: { meanRivalLift: 1, novelty: 1, directionRef: null, relaxedOutlier: false },
  details: { script: SCRIPT, targetDurationSec: 30 },
  source: "weekly_plan",
  evidence: [],
  ...(position === undefined ? {} : { position }),
});
const wrongReview: RawScriptReview = {
  revisedScript: FIXED,
  changes: [],
  claims: [{ text: "Osmanlı İmparatorluğu 1453 yılında İstanbul'u fethetti", verdict: "wrong", note: "Doğrusu: Osmanlı Devleti." }],
};
const deps = (): ScriptReviewDeps & { record: ReturnType<typeof vi.fn>; recordFailure: ReturnType<typeof vi.fn> } => ({ record: vi.fn(async () => "run-1"), recordFailure: vi.fn(async () => undefined) });
const params = () => ({ language: "tr" as const, evidence: [] as RivalTextSource[], notes: [] as string[], runIds: [] as string[], log: () => undefined });

describe("reviewPlannedScripts", () => {
  it("yalnız plana giren fikirler incelenir (çağrı sayısı = plana giren); adaylara dokunulmaz", async () => {
    const llm = createFakeLlm(wrongReview);
    const d = deps();
    const p = params();
    const out = await reviewPlannedScripts(llm.backend, [idea("Birinci", 1), idea("İkinci", 2), idea("Aday")], p, d);
    expect(llm.calls).toHaveLength(2);
    expect(d.record).toHaveBeenCalledTimes(2);
    expect(p.runIds).toEqual(["run-1", "run-1"]);
    expect(out.map((i) => i.title)).toEqual(["Birinci", "İkinci", "Aday"]);
    expect(out[0].details.script).toBe(FIXED);
    expect(out[0].details.scriptReview).toMatchObject({ revised: true, corrections: 1, originalScript: SCRIPT });
    expect(out[2].details).toEqual({ script: SCRIPT, targetDurationSec: 30 });
  });

  it("B2: wrong düzeltmesi notlara 'Düzeltilen olgu: <eski> → <not>' olarak girer; yanlış olgu hook'ta geçiyorsa işaret notu (hook değişmez)", async () => {
    const llm = createFakeLlm(wrongReview);
    const p = params();
    const withHook = { ...idea("Birinci", 1), hooks: ["Osmanlı İmparatorluğu 1453 yılında İstanbul'u fethetti, biliyor muydun?", "b", "c"] };
    const out = await reviewPlannedScripts(llm.backend, [withHook], p, deps());
    const notes = p.notes.join("\n");
    expect(notes).toContain('"Birinci": Düzeltilen olgu: "Osmanlı İmparatorluğu 1453 yılında İstanbul\'u fethetti" → Doğrusu: Osmanlı Devleti.');
    expect(notes).toContain("hook'larda / adımlarda da geçiyor (düzeltilmedi, elle bak)");
    expect(out[0].hooks).toEqual(withHook.hooks);
  });

  it("uncertain iddia plan notuna 'yayından önce doğrula' olarak da düşer", async () => {
    const llm = createFakeLlm({ revisedScript: SCRIPT, changes: [], claims: [{ text: "1453 yılında İstanbul'u fethetti", verdict: "uncertain", note: "Tarihi kontrol et." }] } satisfies RawScriptReview);
    const p = params();
    const out = await reviewPlannedScripts(llm.backend, [idea("Birinci", 1)], p, deps());
    expect(out[0].details.scriptReview?.verifyBeforePublish).toHaveLength(1);
    expect(p.notes.join("\n")).toContain("yayından önce doğrula");
  });

  it("LLM hatası: özgün senaryo kalır, not düşer, başarısız koşu kaydedilir; plan akışı fırlatmaz", async () => {
    const llm = createFakeLlm({ bozuk: true }, { bozuk: true });
    const d = deps();
    const p = params();
    const out = await reviewPlannedScripts(llm.backend, [idea("Birinci", 1)], p, d);
    expect(out[0].details.script).toBe(SCRIPT);
    expect(out[0].details.scriptReview).toBeUndefined();
    expect(p.notes.join("\n")).toContain("özgün senaryo korundu");
    expect(d.recordFailure).toHaveBeenCalledTimes(1);
  });

  it("kod denetimi geçmezse de özgün senaryo kalır ve çağrı kaydedilir", async () => {
    const bad = { ...wrongReview, revisedScript: SCRIPT.replace("1453", "1454"), claims: [] };
    const llm = createFakeLlm(bad, bad);
    const d = deps();
    const out = await reviewPlannedScripts(llm.backend, [idea("Birinci", 1)], params(), d);
    expect(out[0].details.script).toBe(SCRIPT);
    expect(out[0].details.scriptReview).toBeUndefined();
    expect(d.record).toHaveBeenCalledTimes(1);
    expect(llm.calls).toHaveLength(1); // B10: denetim düşse de ikinci LLM çağrısı yok
  });

  it("B1: düzeltme sonrası maxSharedWords yeniden hesaplanır (rakip kanıtına karşı; kendi içerik sayılmaz); kopyalı düzeltme atılır", async () => {
    const rivalLine = "Osmanlı Devleti 1453 yılında İstanbul'u fethetti. Bugün bile o dönemden kalan surların önünde";
    const evidence = [
      { id: "own-1", isOwn: true, transcript: "Osmanlı Devleti 1453 yılında İstanbul'u fethetti bugün bile o dönemden kalan surların önünde durup kendine şunu sor" },
      { id: "r1", isOwn: false, transcript: rivalLine },
    ];
    const llm = createFakeLlm(wrongReview);
    const p = { ...params(), evidence };
    const out = await reviewPlannedScripts(llm.backend, [{ ...idea("Birinci", 1), details: { script: SCRIPT, targetDurationSec: 30, maxSharedWords: 1 } }], p, deps());
    // FIXED ile r1: "Osmanlı Devleti ... fethetti" + "Bugün bile o dönemden kalan surların önünde" = 13 ortak kelime (kopya, düzeltme atılır);
    // özgün senaryoda "İmparatorluğu" yüzünden bu dizi 8'in altında kalıyordu. Kendi içerik (own-1) kopya sayılmaz.
    expect(out[0].details.script).toBe(SCRIPT);
    expect(out[0].details.scriptReview).toBeUndefined();
    expect(out[0].details.maxSharedWords).toBe(1);
    expect(p.notes.join("\n")).toContain("kopya");

    const ok = await reviewPlannedScripts(createFakeLlm(wrongReview).backend, [{ ...idea("İkinci", 1), details: { script: SCRIPT, targetDurationSec: 30, maxSharedWords: 1 } }], { ...params(), evidence: [{ id: "r2", isOwn: false, transcript: "Osmanlı Devleti 1453 yılında İstanbul'u fethetti. Sonra her şey değişti." }] }, deps());
    expect(ok[0].details.script).toBe(FIXED);
    expect(ok[0].details.maxSharedWords).toBe(6); // "Osmanlı Devleti 1453 yılında İstanbul'u fethetti" (kopya sınırının altında; eski değer 1 yeniden hesaplandı)
  });

  it("B4: toplam süre bütçesi dolunca kalan fikirler atlanır, notlanır; her çağrının zaman aşımı kalan bütçeyi aşmaz; plan akışı fırlatmaz", async () => {
    const d = deps();
    const p = params();
    let clock = 0;
    const now = () => clock;
    const llm = createFakeLlm(() => {
      clock += 5 * 60_000; // her editör çağrısı (sahte saatte) 5 dk sürer
      return wrongReview;
    });
    const out = await reviewPlannedScripts(llm.backend, [idea("Bir", 1), idea("İki", 2), idea("Üç", 3), idea("Dört", 4), idea("Aday")], { ...p, now }, d);
    expect(SCRIPT_REVIEW_BUDGET_MS).toBe(8 * 60_000);
    expect(llm.calls).toHaveLength(2); // 0 dk: 4 dk zaman aşımı sınırı yok (240 sn), 5 dk: kalan 3 dk
    expect(llm.calls[0].timeoutMs).toBe(240_000);
    expect(llm.calls[1].timeoutMs).toBe(3 * 60_000);
    expect(out.map((i) => i.details.script)).toEqual([FIXED, FIXED, SCRIPT, SCRIPT, SCRIPT]);
    expect(p.notes.join("\n")).toMatch(/süre bütçesi \(8 dk\) doldu; 2 fikir özgün senaryoyla bırakıldı.*"Üç", "Dört"/);
    expect(d.recordFailure).not.toHaveBeenCalled();
  });

  it("B4: bütçe içinde kalınca atlama notu yok", async () => {
    const llm = createFakeLlm(wrongReview);
    const p = params();
    await reviewPlannedScripts(llm.backend, [idea("Bir", 1), idea("İki", 2)], { ...p, now: () => 0 }, deps());
    expect(llm.calls).toHaveLength(2);
    expect(p.notes.join("\n")).not.toContain("süre bütçesi");
  });
});
