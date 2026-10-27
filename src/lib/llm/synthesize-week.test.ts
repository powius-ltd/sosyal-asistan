import { describe, expect, it } from "vitest";

import { WEEKLY_PLAN_SECTIONS_SCHEMA } from "@/lib/data/weekly-plan-schema";
import type { WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import { createFakeLlm } from "@/lib/llm/backend-fake";
import { PROMPT_VERSION, synthesizeWeek } from "@/lib/llm/synthesize-week";
import { assertDraftIntact, buildTargets, hasNumericClaim, type WeekContent } from "@/lib/llm/synthesize-week-output";
import { indexById } from "@/lib/llm/content-text";

const draft: WeeklyPlanSections = {
  winners: {
    rivals: [
      { contentItemId: "r1", ownerHandle: "noelle", isOwn: false, lift: 4.2, views: 120000, analyzed: true, hookType: "callout", durationSec: 92 },
      { contentItemId: "r2", ownerHandle: "align", isOwn: false, lift: 3.1, analyzed: false },
    ],
    own: [{ contentItemId: "o1", ownerHandle: "ornek", isOwn: true, lift: 1.8, analyzed: true }],
    relaxedThreshold: false,
  },
  focus: {
    directions: [
      { group: "duration_bucket", value: "60_90", label: "60–90 sn", impact: 2.2, novelty: 1.5, score: 3.3, sampleSize: 6, confidence: "medium", ownTried: false, evidenceContentIds: ["r1", "r3"] },
      { group: "hook_type", value: "callout", label: "Seslenme", impact: 1.6, novelty: 1, score: 1.6, sampleSize: 4, confidence: "low", ownTried: true, evidenceContentIds: ["r2"] },
    ],
  },
  schedule: { postsPerWeek: 4, audienceTimeZone: "America/New_York", slots: [] },
  avoid: { entries: [{ kind: "low_lift", group: "duration_bucket", value: "under_15", label: "15 sn altı", medianLift: 0.5, sampleSize: 5, confidence: "medium", reason: "Taslak gerekçe" }] },
  review: { status: "awaiting_publish_data" },
};

const corpus: WeekContent[] = [
  { id: "r1", ownerHandle: "noelle", transcript: "Listen, if you keep scrolling past this, you are choosing to stay stuck. Comment FUTURE SELF and I will send you the ritual I use every single morning." },
  { id: "r3", ownerHandle: "evelyn", transcript: "Nobody talks about the ninety second rule for anger, and it changes everything." },
  { id: "o1", ownerHandle: "ornek", transcript: "Take a breath. You are allowed to begin again, even today.", caption: "Begin again." },
];

const QUOTE_R1 = "Comment FUTURE SELF and I will send you the ritual";
const valid = () => ({
  summary: "Uzun ve doğrudan seslenen videolar öne çıktı; bu hafta daha uzun bir format denemeye değer.",
  winners: [
    { id: "r1", why: "Doğrudan seslenip yorumla anahtar kelime istiyor.", quote: QUOTE_R1 },
    { id: "o1", why: "Sakin bir yeniden başlama daveti.", quote: "You are allowed to begin again" },
  ],
  focus: [{ ref: "F1", rationale: "Uzun videolar daha çok izlenmiş; Ornek bunu denemedi.", quoteFrom: "r3", quote: "Nobody talks about the ninety second rule" }],
  avoid: [{ ref: "A1", reason: "Çok kısa videolar zayıf kaldı." }],
});

const run = (...outputs: unknown[]) => {
  const llm = createFakeLlm(...outputs);
  return { llm, result: synthesizeWeek(llm.backend, { draft, corpus }) };
};

describe("synthesizeWeek: geçerli çıktı", () => {
  it("metinler birleşir; sayı/id alanları taslakla birebir; sonuç plan şemasından geçer", async () => {
    const { llm, result } = run(valid());
    const out = await result;

    const [r1, r2] = out.sections.winners.rivals;
    expect(r1).toMatchObject({ contentItemId: "r1", lift: 4.2, views: 120000, why: "Doğrudan seslenip yorumla anahtar kelime istiyor.", quote: { contentItemId: "r1", ownerHandle: "noelle", text: QUOTE_R1 } });
    expect(r2.why).toBeUndefined(); // analiz edilmemiş tutan: metin yok
    expect(out.sections.winners.own[0].quote?.text).toBe("You are allowed to begin again");
    // Gerekçe yalnız metindir; doğrulanmış alıntı metne gömülmez, yapısal alanda (`rationaleQuote`) durur.
    expect(out.sections.focus.directions[0].rationale).toBe("Uzun videolar daha çok izlenmiş; Ornek bunu denemedi.");
    expect(out.sections.focus.directions[0].rationaleQuote).toEqual({ contentItemId: "r3", ownerHandle: "evelyn", text: "Nobody talks about the ninety second rule" });
    expect(out.sections.focus.directions[1].rationale).toBeUndefined(); // kanıtı korpussuz: modele gitmedi
    expect(out.sections.focus.directions[1].rationaleQuote).toBeUndefined();
    expect(out.sections.avoid.entries[0]).toMatchObject({ reason: "Çok kısa videolar zayıf kaldı.", medianLift: 0.5, sampleSize: 5 });
    expect(out.summary).toContain("Uzun ve doğrudan");
    expect(out.dropped).toEqual([]);
    expect(out.promptVersion).toBe(PROMPT_VERSION);
    expect(out.meta).toMatchObject({ kind: "llm_week_synthesis", attempts: 1 });

    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(out.sections).success).toBe(true);
    assertDraftIntact(draft, out.sections);
    expect(out.sections.schedule).toEqual(draft.schedule);
    expect(out.sections.focus.directions.map((d) => [d.score, d.sampleSize, d.evidenceContentIds])).toEqual(draft.focus.directions.map((d) => [d.score, d.sampleSize, d.evidenceContentIds]));

    const stdin = llm.calls[0].input as string;
    expect(stdin).not.toContain('"r2"'); // analiz edilmemiş tutan ve korpussuz yön modele gitmez
    expect(stdin).toContain('"ref":"F1"');
    expect(stdin).not.toContain('"ref":"F2"');
  });
});

describe("synthesizeWeek: SAYIYA ve ID'YE dokunamaz", () => {
  it("model tutana sayısal alan (lift) eklemeye çalışırsa şema reddeder: iki denemede de sürerse invalid_output", async () => {
    const tampered = valid();
    (tampered.winners[0] as Record<string, unknown>).lift = 99;
    const { llm, result } = run(tampered);
    await expect(result).rejects.toMatchObject({ code: "invalid_output" });
    expect(llm.calls).toHaveLength(2);
  });

  it("modelin kök düzeyde fazladan bölüm/alan (ör. schedule) eklemesi de reddedilir", async () => {
    const { result } = run({ ...valid(), schedule: { postsPerWeek: 9 } });
    await expect(result).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("birleştirme sonrası taslaktaki sayı değiştirilmişse assertDraftIntact fırlatır; metin alanı değişimi serbest", () => {
    const changed = structuredClone(draft);
    changed.winners.rivals[0].lift = 99;
    expect(() => assertDraftIntact(draft, changed)).toThrow(expect.objectContaining({ code: "invalid_output" }));

    const relabeled = structuredClone(draft);
    relabeled.winners.rivals[0].why = "yeni metin";
    relabeled.avoid.entries[0].reason = "başka gerekçe";
    expect(() => assertDraftIntact(draft, relabeled)).not.toThrow();

    const moved = structuredClone(draft);
    moved.focus.directions[0].evidenceContentIds = ["r9"];
    expect(() => assertDraftIntact(draft, moved)).toThrow();
  });

  it("id kümesi uyuşmazsa (uydurma id / eksik tutan) düzeltme turu; sürerse invalid_output", async () => {
    const bad = valid();
    bad.winners = [bad.winners[0], { id: "uydurma", why: "x", quote: "y z" }];
    const fixed = createFakeLlm(bad, valid());
    const ok = await synthesizeWeek(fixed.backend, { draft, corpus });
    expect(ok.meta?.attempts).toBe(2);
    expect(fixed.calls[1].input).toContain("eksik winner id: o1");
    expect(fixed.calls[1].input).toContain("girdide olmayan winner id: uydurma");

    const stuck = createFakeLlm(bad);
    await expect(synthesizeWeek(stuck.backend, { draft, corpus })).rejects.toMatchObject({ code: "invalid_output", meta: { attempts: 2 } });
  });

  it("focus ref'i uydurulursa ya da avoid ref'i eksikse sert hata", async () => {
    const badFocus = valid();
    badFocus.focus = [{ ...badFocus.focus[0], ref: "F9" }];
    await expect(run(badFocus).result).rejects.toMatchObject({ code: "invalid_output" });

    const noAvoid = { ...valid(), avoid: [] };
    await expect(run(noAvoid).result).rejects.toMatchObject({ code: "invalid_output" });
  });
});

describe("synthesizeWeek: metin denetimi (yumuşak: o metin atılır)", () => {
  it("korpusta olmayan alıntı → o tutanın why+quote'u atılır, diğerleri kalır; dropped'a yazılır", async () => {
    const bad = valid();
    bad.winners[0] = { id: "r1", why: "Güçlü bir çağrı.", quote: "Comment DREAM LIFE and I will send you a miracle" };
    const { result } = run(bad);
    const out = await result;
    expect(out.sections.winners.rivals[0].why).toBeUndefined();
    expect(out.sections.winners.rivals[0].quote).toBeUndefined();
    expect(out.sections.winners.own[0].why).toBeDefined();
    expect(out.dropped.join("\n")).toContain("winner r1");
    expect(out.meta?.attempts).toBe(2); // düzeltme turu denendi
  });

  it("alıntı başka içeriğin metninden (yanlış id'ye atfedilmiş) → atılır", async () => {
    const bad = valid();
    bad.winners[1] = { id: "o1", why: "Sakin.", quote: QUOTE_R1 }; // r1'in cümlesi o1'e atfedilmiş
    const out = await run(bad).result;
    expect(out.sections.winners.own[0].quote).toBeUndefined();
  });

  it("yön alıntısı o yönün kanıt içeriği dışından gelirse atılır", async () => {
    const bad = valid();
    bad.focus = [{ ref: "F1", rationale: "Gerekçe.", quoteFrom: "o1", quote: "You are allowed to begin again" }]; // o1, F1'in kanıtı değil
    const out = await run(bad).result;
    expect(out.sections.focus.directions[0].rationale).toBeUndefined();
    expect(out.sections.focus.directions[0].rationaleQuote).toBeUndefined(); // gerekçe atılınca alıntı da yazılmaz
    expect(out.dropped.join("\n")).toContain("focus F1");
  });

  it("metinde çarpan/yüzde (3x, %60, 4 kat) → metin atılır; kaçınma metni atılırsa taslak gerekçe korunur", async () => {
    const bad = valid();
    bad.winners[0].why = "Normalin 4,2x üstünde izlendi.";
    bad.avoid = [{ ref: "A1", reason: "Medyanı %50 düşük." }];
    bad.summary = "Videolar 3 kat fazla izlendi.";
    const out = await run(bad).result;
    expect(out.sections.winners.rivals[0].why).toBeUndefined();
    expect(out.sections.avoid.entries[0].reason).toBe("Taslak gerekçe");
    expect(out.summary).toBeUndefined();
    expect(out.dropped).toHaveLength(3);
  });

  it("hasNumericClaim: çarpan/yüzde biçimleri yakalanır, sıradan sayılar yakalanmaz", () => {
    for (const text of ["4,2x üstünde", "3 kat fazla", "%60 düşük", "60% altında", "x3 daha iyi", "2.5× lift"]) expect(hasNumericClaim(text)).toBe(true);
    for (const text of ["son 30 günde", "2026 yılında", "üç kat değil", "kat kat arttı"]) expect(hasNumericClaim(text)).toBe(false);
  });
});

describe("synthesizeWeek: girdi", () => {
  it("yazılacak metin yoksa (korpussuz) model çağrılmaz; taslak aynen döner", async () => {
    const llm = createFakeLlm(valid());
    const empty: WeeklyPlanSections = { ...draft, winners: { rivals: [], own: [], relaxedThreshold: false }, focus: { directions: [] }, avoid: { entries: [] } };
    const out = await synthesizeWeek(llm.backend, { draft: empty, corpus: [] });
    expect(llm.calls).toHaveLength(0);
    expect(out.sections).toEqual(empty);
    expect(out.meta).toBeUndefined();
  });

  it("şemaya uymayan taslak invalid_input (token harcanmaz)", async () => {
    const llm = createFakeLlm(valid());
    await expect(synthesizeWeek(llm.backend, { draft: { winners: {} } as never, corpus })).rejects.toMatchObject({ code: "invalid_input" });
    expect(llm.calls).toHaveLength(0);
  });

  it("buildTargets: analiz edilmemiş/korpussuz tutan ve korpussuz yön hedef olmaz; ref'ler taslak sırasıyla", () => {
    const targets = buildTargets(draft, indexById(corpus));
    expect(targets.winnerIds).toEqual(["r1", "o1"]);
    expect(targets.focus).toEqual([{ ref: "F1", index: 0, evidenceIds: ["r1", "r3"] }]);
    expect(targets.avoid).toEqual([{ ref: "A1", index: 0 }]);
  });
});
