import { describe, expect, it } from "vitest";

import { MANUAL_IDEA_DAILY_MAX } from "@/lib/data/manual-idea-input";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

describe("mock createManualIdea · günlük sınır", () => {
  it("24 saatte en çok MANUAL_IDEA_DAILY_MAX; sınır aşılınca invalid_state, 25 saat sonra yeniden açılır", async () => {
    const r = createMockRepository();
    const now = new Date(MOCK_NOW);
    for (let i = 0; i < MANUAL_IDEA_DAILY_MAX; i += 1) await r.createManualIdea(WS, { title: `Fikir ${i}`, note: "Not" }, now);
    await expect(r.createManualIdea(WS, { title: "Taşan", note: "Not" }, now)).rejects.toMatchObject({ code: "invalid_state" });
    const later = new Date(now.getTime() + 25 * 3_600_000);
    await expect(r.createManualIdea(WS, { title: "Ertesi gün", note: "Not" }, later)).resolves.toMatchObject({ source: "manual" });
  });
});
