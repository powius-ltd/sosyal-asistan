// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AutomationList } from "@/components/automation/automation-list";
import { buildAutomationRows } from "@/lib/automation/model";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

describe("AutomationList", () => {
  it("4 satırı adı, durumu, son çalışması ve sıradakiyle çizer", async () => {
    const repo = createMockRepository();
    const workspace = await repo.getWorkspace(WS);
    if (workspace === null) throw new Error("mock çalışma alanı yok");
    const rows = buildAutomationRows({ workspace, jobs: await repo.listJobs(WS, { limit: 200 }), now: new Date(MOCK_NOW), produceReady: false });
    const { container } = render(<AutomationList rows={rows} canEdit={false} />);
    expect(container.querySelectorAll("li[data-automation]")).toHaveLength(4);
    expect(screen.getByText("Haftalık plan")).toBeTruthy();
    expect(screen.getByText("Hep açık")).toBeTruthy();
    expect(screen.getByText("Yakında")).toBeTruthy();
    expect(screen.getAllByText("Sıradaki:")).toHaveLength(4);
  });
});
