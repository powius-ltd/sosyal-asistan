import { afterEach, describe, expect, it, vi } from "vitest";

import { getPanelContext } from "@/lib/data";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";

afterEach(() => vi.unstubAllEnvs());

describe("getPanelContext: tek saat", () => {
  it("mock kaynakta now = sabit MOCK_NOW (gerçek saat değil); her çağrıda aynı", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    const a = await getPanelContext();
    const b = await getPanelContext();
    expect(a.now).toBeInstanceOf(Date);
    expect(a.now.toISOString()).toBe(MOCK_NOW);
    expect(b.now.toISOString()).toBe(MOCK_NOW);
    expect(a.wsId).toBe(MOCK_WORKSPACE_ID);
  });

  it("çağıranın değiştirmesi paylaşılan saati bozmaz (her çağrı yeni Date)", async () => {
    const a = await getPanelContext();
    a.now.setFullYear(1999);
    expect((await getPanelContext()).now.toISOString()).toBe(MOCK_NOW);
  });
});
