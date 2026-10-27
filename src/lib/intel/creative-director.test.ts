import { describe, expect, it, vi } from "vitest";

import type { IntelContext } from "@/lib/intel/context";
import { briefInputOf, directBrief, type DirectorDeps } from "@/lib/intel/creative-director";
import { createFakeLlm } from "@/lib/llm/backend-fake";
import { BRIEF_INPUT, validRawBrief } from "@/lib/llm/creative-brief-fixtures";
import type { ProvenIdea } from "@/lib/intel/proven-ideas-types";
import type { WeeklyPlanSections } from "@/lib/domain/weekly-plan";

const card = (id: string, kind: "proven" | "single", accounts: number): ProvenIdea =>
  ({ id, kind, basis: "topic", cellKey: id, cellLabel: `Konu ${id}`, hookType: "question", evidence: [{ contentItemId: `c-${id}` }], accountCount: accounts, platformCount: 1, medianLift: 4.26, confidence: "medium", anatomy: {}, ownTried: false }) as unknown as ProvenIdea;

const sections = {
  schedule: { postsPerWeek: 4, slots: [] },
  focus: { directions: BRIEF_INPUT.directions.map((d) => ({ ...d, evidenceContentIds: [`e-${d.ref}`], rationale: d.rationale ?? "" })) },
} as unknown as WeeklyPlanSections;

const ctx = { workspace: { accountType: "business", nicheBrief: "niş" } } as unknown as IntelContext;
const deps = (over: Partial<DirectorDeps> = {}): DirectorDeps => ({
  cards: async () => BRIEF_INPUT.cards.map((c) => card(c.id, "proven", 2)),
  anatomy: async () => undefined,
  lastWeek: async () => ({ summary: "Geçen hafta özeti", ideas: ["Bir fikir"] }),
  record: vi.fn(async () => "run-1"),
  recordFailure: vi.fn(async () => undefined),
  ...over,
});
const params = () => ({ weekStart: "2026-10-26", sections, reviews: [], notes: [] as string[], runIds: [] as string[], log: () => undefined });

describe("briefInputOf", () => {
  it("kartları proven önce sıralar, 8'e kısaltır, kanıtı ref'e bağlar", () => {
    const cards = [card("a", "single", 5), ...Array.from({ length: 9 }, (_, i) => card(`p${i}`, "proven", 2))];
    const built = briefInputOf({ slotCount: 4, accountType: "business", sections, cards });
    expect(built.input.cards).toHaveLength(8);
    expect(built.input.cards[0].kind).toBe("proven");
    expect(built.evidenceByRef["p0"]).toEqual(["c-p0"]);
    expect(built.evidenceByRef["F1"]).toEqual(["e-F1"]);
    expect(built.input.lastWeek).toBeUndefined();
  });
});

describe("directBrief", () => {
  it("geçerli brif: dönüş brif + kanıt haritası, koşu kaydedilir", async () => {
    const d = deps();
    const llm = createFakeLlm(validRawBrief());
    const p = params();
    const out = await directBrief(ctx, llm.backend, p, d);
    expect(out?.brief.slots).toHaveLength(4);
    expect(out?.evidenceByRef["topic:c1:question"]).toEqual(["c-topic:c1:question"]);
    expect(d.record).toHaveBeenCalledTimes(1);
    expect(p.runIds).toEqual(["run-1"]);
  });

  it("brif denetimi geçmezse undefined + not (plan brifsiz sürer)", async () => {
    const bad = validRawBrief();
    bad.slots.pop();
    const p = params();
    const out = await directBrief(ctx, createFakeLlm(bad, bad).backend, p, deps());
    expect(out).toBeUndefined();
    expect(p.notes.join("\n")).toContain("plan brifsiz, bugünkü yolla üretildi");
  });

  it("okuma hatası planı düşürmez: undefined + not", async () => {
    const p = params();
    const out = await directBrief(ctx, createFakeLlm(validRawBrief()).backend, p, deps({ cards: async () => { throw new Error("db yok"); } }));
    expect(out).toBeUndefined();
    expect(p.notes.join("\n")).toContain("db yok");
  });

  it("kart ve yön yoksa LLM çağrılmaz: undefined + not", async () => {
    const empty = { ...sections, focus: { directions: [] } } as unknown as WeeklyPlanSections;
    const llm = createFakeLlm(validRawBrief());
    const p = { ...params(), sections: empty };
    const out = await directBrief(ctx, llm.backend, p, deps({ cards: async () => [] }));
    expect(out).toBeUndefined();
    expect(llm.calls).toHaveLength(0);
    expect(p.notes.join("\n")).toContain("brifi atlandı");
  });
});
