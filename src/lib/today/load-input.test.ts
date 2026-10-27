import { describe, expect, it, vi } from "vitest";

import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { RepositoryError } from "@/lib/data/repository";
import { loadTodayInput } from "@/lib/today/load-input";
import { buildToday } from "@/lib/today/state";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const now = new Date(MOCK_NOW);

describe("loadTodayInput", () => {
  it("mock depodan girdiyi kurar; kuyruk üretilir ve düz nesnedir (istemciye geçebilir)", async () => {
    const input = await loadTodayInput(createMockRepository(), WS, now, { operator: true });
    expect(input.now).toBe(now);
    expect(input.summary.operator).toBe(true);
    expect(input.summary.accounts?.length).toBeGreaterThan(0);
    expect(input.summary.currentWeekStart).toBe("2026-09-28");
    expect(input.suggestedLinks).toBeDefined();
    expect(input.pendingJobs).toBeDefined();
    expect(input.rivalCandidates).toBeTypeOf("number");
    const today = buildToday(input);
    expect(JSON.parse(JSON.stringify(today.queue))).toEqual(today.queue.map((card) => JSON.parse(JSON.stringify(card))));
    expect(new Set(today.queue.map((card) => card.id)).size).toBe(today.queue.length);
  });

  it("müşteri modunda yönetici okuması (rakip adayları) yapılmaz", async () => {
    const repo = createMockRepository();
    const listCompetitors = vi.spyOn(repo, "listCompetitors");
    const input = await loadTodayInput(repo, WS, now, { operator: false });
    expect(listCompetitors).not.toHaveBeenCalled();
    expect(input.rivalCandidates).toBeUndefined();
    expect(buildToday(input).queue.some((card) => card.operatorOnly)).toBe(false);
  });

  it("ek okumalardan biri fırlatırsa yalnız o parça düşer", async () => {
    const repo = createMockRepository();
    const unavailable = async () => {
      throw new RepositoryError("not_implemented", "yok");
    };
    vi.spyOn(repo, "listPublishJobs").mockImplementation(unavailable);
    vi.spyOn(repo, "listIdeaLinks").mockImplementation(unavailable);
    const input = await loadTodayInput(repo, WS, now, { operator: false });
    expect(input.pendingJobs).toBeUndefined();
    expect(input.suggestedLinks).toBeUndefined();
    expect(input.summary.suggestedLinks).toBeUndefined();
    expect(input.summary.overview).toBeDefined();
    expect(() => buildToday(input)).not.toThrow();
  });

  it("kayıt başına okuma yok: tekil okuma metotları hiç çağrılmaz", async () => {
    const repo = createMockRepository();
    const spies = (["getIdea", "getContent"] as const).map((name) => vi.spyOn(repo, name));
    await loadTodayInput(repo, WS, now, { operator: true });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
