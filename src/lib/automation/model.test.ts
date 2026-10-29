import { describe, expect, it } from "vitest";

import { AUTOMATION_COPY } from "@/lib/copy/automation";
import { buildAutomationRows, AUTOMATION_IDS } from "@/lib/automation/model";
import { AUTOMATION_DEFAULTS, automationFlagsOf } from "@/lib/automation/flags";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { PANEL_JARGON } from "@/lib/plain-language";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const now = new Date(MOCK_NOW);

async function mockInput() {
  const repo = createMockRepository();
  const workspace = await repo.getWorkspace(WS);
  if (workspace === null) throw new Error("mock çalışma alanı yok");
  const jobs = await repo.listJobs(WS, { limit: 200 });
  return { workspace, jobs, now };
}

describe("automationFlagsOf", () => {
  it("alan yoksa varsayılan: plan açık, ölçüm açık, üretim kapalı", () => {
    expect(automationFlagsOf({})).toEqual(AUTOMATION_DEFAULTS);
    expect(automationFlagsOf({ autoWeeklyPlan: false, autoProduce: true })).toEqual({ weeklyPlan: false, measure: true, produce: true });
  });
});

describe("buildAutomationRows", () => {
  it("4 satır, sırayla; mock'ta haftalık planın son çalışması dolu", async () => {
    const rows = buildAutomationRows({ ...(await mockInput()), produceReady: false });
    expect(rows.map((row) => row.id)).toEqual([...AUTOMATION_IDS]);
    const plan = rows[0]!;
    expect(plan.last.state).toBe("done");
    expect(plan.last.at).toBeDefined();
    expect(plan.next.length).toBeGreaterThan(0);
  });

  it("hiç iş yoksa 'henüz çalışmadı' der (tarih uydurmaz)", async () => {
    const rows = buildAutomationRows({ ...(await mockInput()), jobs: [], produceReady: false });
    for (const row of rows) {
      expect(row.last).toEqual({ state: "never", text: AUTOMATION_COPY.last.never });
    }
  });

  it("kapalı ayar sıradakini 'çalışmaz' yapar; paylaşım hep açık; üretim hazır değilse yakında", async () => {
    const input = await mockInput();
    const rows = buildAutomationRows({ ...input, workspace: { ...input.workspace, autoWeeklyPlan: false, autoMeasure: false }, produceReady: false });
    expect(rows[0]!.next.startsWith(AUTOMATION_COPY.next.off)).toBe(true);
    expect(rows[1]).toMatchObject({ enabled: false });
    expect(rows[1]!.next).toContain("açarsan");
    expect(rows[2]).toMatchObject({ mode: "soon", enabled: false });
    expect(rows[3]).toMatchObject({ mode: "always", enabled: true });
  });

  it("üretim hazırsa anahtarla açılır", async () => {
    const input = await mockInput();
    const off = buildAutomationRows({ ...input, produceReady: true })[2]!;
    expect(off).toMatchObject({ mode: "toggle", enabled: false, settingKey: "produce" });
    const on = buildAutomationRows({ ...input, workspace: { ...input.workspace, autoProduce: true }, produceReady: true })[2]!;
    expect(on).toMatchObject({ enabled: true, next: AUTOMATION_COPY.next.afterPlanApproval });
  });

  it("onaysız ajan tavanı (undefined) planın altına uyarı yazar; 0 onaylıdır, uyarı yok", async () => {
    const input = await mockInput();
    const unapproved = buildAutomationRows({ ...input, workspace: { ...input.workspace, agentMonthlyCapUsd: undefined }, produceReady: false })[0]!;
    expect(unapproved.note).toBe(AUTOMATION_COPY.notes.noCap);
    const zero = buildAutomationRows({ ...input, workspace: { ...input.workspace, agentMonthlyCapUsd: 0 }, produceReady: false })[0]!;
    expect(zero.note).toBeUndefined();
  });

  it("müşteri metninde panel jargonu yok", () => {
    expect(JSON.stringify(AUTOMATION_COPY)).not.toMatch(PANEL_JARGON);
  });
});
