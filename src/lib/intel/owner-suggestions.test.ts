import { describe, expect, it } from "vitest";

import { testIdea } from "@/components/ideas/test-idea";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { loadOwnerSuggestions, ownerSuggestionsNote, OWNER_SUGGESTIONS_MAX, pickOwnerSuggestions } from "@/lib/intel/owner-suggestions";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

describe("pickOwnerSuggestions", () => {
  it("yalnız elle + yeni fikirler; en yeni önce; en çok 10", () => {
    const manual = (n: number, patch: Parameters<typeof testIdea>[0] = {}) =>
      testIdea({ id: `m${n}`, source: "manual", title: `Fikir ${n}`, rationale: `Not ${n}`, createdAt: `2026-09-${String(10 + n).padStart(2, "0")}T10:00:00.000Z`, ...patch });
    const ideas = [
      ...Array.from({ length: 12 }, (_, i) => manual(i)),
      manual(20, { status: "dismissed" }),
      testIdea({ id: "g1", source: "generated" }),
      testIdea({ id: "w1", source: "weekly_plan" }),
    ];
    const picked = pickOwnerSuggestions(ideas);
    expect(picked).toHaveLength(OWNER_SUGGESTIONS_MAX);
    expect(picked[0]).toEqual({ title: "Fikir 11", note: "Not 11" });
    expect(picked.map((p) => p.title)).not.toContain("Fikir 20");
    expect(picked.map((p) => p.title)).not.toContain("Fikir 0");
  });
  it("not: 0 ise yok, N ise sayıyı söyler", () => {
    expect(ownerSuggestionsNote(0)).toBeUndefined();
    expect(ownerSuggestionsNote(2)).toContain("2 elle fikri");
  });
});

describe("loadOwnerSuggestions (mock depo)", () => {
  it("sohbetten kaydedilen fikir okunur; kapatılan okunmaz", async () => {
    const repo = createMockRepository();
    const kept = await repo.createManualIdea(WS, { title: "Mutfak turu", note: "Evimin mutfağını gezdireceğim." }, new Date(MOCK_NOW));
    const gone = await repo.createManualIdea(WS, { title: "Vazgeçtim", note: "x" }, new Date(MOCK_NOW));
    await repo.updateIdeaStatus(WS, gone.id, "dismissed");
    const suggestions = await loadOwnerSuggestions(repo, WS);
    expect(suggestions).toContainEqual({ title: kept.title, note: "Evimin mutfağını gezdireceğim." });
    expect(suggestions.map((s) => s.title)).not.toContain("Vazgeçtim");
  });
});
