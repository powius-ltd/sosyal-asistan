import { describe, expect, it } from "vitest";

import { briefingItemSchema } from "@/lib/data/briefing-schema";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { PANEL_JARGON } from "@/lib/plain-language";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";

describe("mock · Analist brifingi: müşteri dilinde", () => {
  it("not metinlerinde (başlık, gövde, eylem etiketi) panel jargonu ve '5,9x' biçimi yok; çarpan 'normalinin X katı'", async () => {
    const briefing = await createMockRepository().getLatestBriefing(MOCK_WORKSPACE_ID);
    expect(briefing?.items.length).toBeGreaterThan(2);
    for (const item of briefing?.items ?? []) {
      for (const text of [item.headline, item.body, item.action?.label ?? ""]) {
        expect(text, text).not.toMatch(PANEL_JARGON);
        expect(text, text).not.toMatch(/\d\s?x\b/i);
      }
      expect(briefingItemSchema.safeParse(item).success).toBe(true);
    }
    expect(briefing?.items.map((item) => item.body).join(" ")).toMatch(/normalinin \d+(,\d)? katı izlendi/);
  });
});
