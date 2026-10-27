import { describe, expect, it } from "vitest";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { loadTodayInput } from "@/lib/today/load-input";
import { deriveWeeklyFlow } from "@/lib/weekly-flow/derive";
import { loadWeeklyFlowInput } from "@/lib/weekly-flow/load";

import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const now = new Date(MOCK_NOW);

describe("loadWeeklyFlowInput (mock depo)", () => {
  it("kendi okumasıyla girdi kurar ve akış beş adım döner", async () => {
    const repo = createMockRepository();
    const input = await loadWeeklyFlowInput({ repo, wsId: WS, now });
    expect(input.now).toBe(now);
    expect(input.currentWeekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(input.ticketIdeaIds).toEqual([]);
    expect(deriveWeeklyFlow(input)).toHaveLength(5);
  });

  it("today verilirse plan ve son toplama Bugün'ün okumasından gelir (aynı sonuç)", async () => {
    const repo = createMockRepository();
    const today = await loadTodayInput(repo, WS, now, { operator: false });
    const viaToday = await loadWeeklyFlowInput({ repo, wsId: WS, now, today });
    const own = await loadWeeklyFlowInput({ repo, wsId: WS, now });
    expect(viaToday.currentWeekStart).toBe(own.currentWeekStart);
    expect(viaToday.plan?.weekStart).toBe(own.plan?.weekStart);
    expect(viaToday.lastCollectedAt).toBe(own.lastCollectedAt);
    expect(typeof viaToday.pendingAnalysis).toBe("number");
  });

  it("okuma düşerse ilgili parça undefined kalır (0 değil)", async () => {
    const base = createMockRepository();
    const repo = { ...base, listOutliers: () => Promise.reject(new Error("düştü")), listJobs: () => Promise.reject(new Error("düştü")) } as typeof base;
    const input = await loadWeeklyFlowInput({ repo, wsId: WS, now });
    expect(input.pendingAnalysis).toBeUndefined();
    expect(input.activeJobKinds).toBeUndefined();
  });
});
