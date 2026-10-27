import { describe, expect, it } from "vitest";

import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { MULTIPLIER_BADGE, PANEL_JARGON } from "@/lib/plain-language";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

describe("örnek bildirimler: düz dil (D1-08, D1-09)", () => {
  it("başlık ve gövdede panel jargonu ('aday', 'baz çizgisi') ve çarpan rozeti ('8,7x') yok; çarpan 'katı' diye söylenir", async () => {
    const repo = createMockRepository();
    const items = (await repo.listNotifications(WS, { limit: 100 })).items;
    expect(items.length).toBeGreaterThan(0);
    for (const note of items) {
      const text = `${note.title} ${note.body}`;
      expect(text, text).not.toMatch(PANEL_JARGON);
      expect(text, text).not.toMatch(MULTIPLIER_BADGE);
    }
    expect(items.filter((note) => note.kind === "competitor_outlier").every((note) => /normalinin [\d,]+ katı izlendi/.test(note.title))).toBe(true);
    expect(items.some((note) => note.kind === "system" && /benzer hesap önerisi bulundu/.test(note.title))).toBe(true);
  });
});
