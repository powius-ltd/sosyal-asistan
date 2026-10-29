import { describe, expect, it } from "vitest";

import { buildAutomationRows } from "@/lib/automation/model";
import { summarizeAutomation } from "@/lib/automation/summary";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

async function rowsWith(patch: Record<string, boolean>, jobsOverride?: never[]) {
  const repo = createMockRepository();
  const workspace = await repo.getWorkspace(WS);
  if (workspace === null) throw new Error("mock çalışma alanı yok");
  const jobs = jobsOverride ?? (await repo.listJobs(WS, { limit: 200 }));
  return buildAutomationRows({ workspace: { ...workspace, ...patch }, jobs, now: new Date(MOCK_NOW), produceReady: true });
}

describe("summarizeAutomation", () => {
  it("açık işleri tek satırda yazar; zaman bilinmiyorsa uydurmaz", async () => {
    const text = summarizeAutomation(await rowsWith({}, []));
    expect(text).toBe("Plan sıradaki turda · ölçüm her gün");
  });

  it("kapalı işler yazılmaz; üretim açıksa eklenir", async () => {
    expect(summarizeAutomation(await rowsWith({ autoWeeklyPlan: false }, []))).toBe("ölçüm her gün");
    expect(summarizeAutomation(await rowsWith({ autoProduce: true }, []))).toBe("Plan sıradaki turda · ölçüm her gün · üretim plan onayında");
  });

  it("hepsi kapalıysa bunu söyler", async () => {
    expect(summarizeAutomation(await rowsWith({ autoWeeklyPlan: false, autoMeasure: false }, []))).toBe("Hepsi kapalı");
  });

  it("plan zamanı biliniyorsa gün ve saat yazılır", async () => {
    const rows = await rowsWith({}, []);
    const withAt = rows.map((row) => (row.id === "weekly_plan" ? { ...row, nextAt: "2026-11-01T15:00:00.000Z" } : row));
    expect(summarizeAutomation(withAt, "Europe/Istanbul")).toMatch(/^Plan \S+ 18:00 · ölçüm her gün$/);
  });
});
