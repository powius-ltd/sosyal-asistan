import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, repo } = vi.hoisted(() => ({ revalidatePath: vi.fn(), repo: { updateWorkspace: vi.fn() } }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/data", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/data")>();
  return { ...original, getPanelContext: async () => ({ repo, wsId: "ws_test" }) };
});

import { updateAgentSettings } from "@/app/actions/agent-settings";
import { updateWorkspaceSettings } from "@/app/actions/settings";

const VALID = { agentMonthlyCapUsd: 3, collectEveryDays: 14, collectVideoLimit: 25, rivalTarget: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPERATOR_MODE", "local");
  vi.stubEnv("VERCEL", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("updateAgentSettings", () => {
  it("geçerli ayarı çalışma alanıyla depoya iletir (tavan onayı depoda yazılır) ve Ayarlar'ı yeniler", async () => {
    repo.updateWorkspace.mockResolvedValue({});
    expect(await updateAgentSettings(VALID)).toEqual({ ok: true });
    expect(repo.updateWorkspace).toHaveBeenCalledWith("ws_test", VALID);
    expect(revalidatePath).toHaveBeenCalledWith("/ayarlar");
  });

  it("sınır dışı, eksik, ek alanlı ve boş girdiyi depoya gitmeden reddeder", async () => {
    for (const input of [
      { ...VALID, agentMonthlyCapUsd: -1 },
      { ...VALID, agentMonthlyCapUsd: 1001 },
      { ...VALID, collectEveryDays: 0 },
      { ...VALID, collectEveryDays: 61 },
      { ...VALID, collectVideoLimit: 4 },
      { ...VALID, rivalTarget: 11 },
      { ...VALID, rivalTarget: 1.5 },
      { collectEveryDays: 14, collectVideoLimit: 25, rivalTarget: 3 },
      null,
    ]) {
      expect((await updateAgentSettings(input)).ok, JSON.stringify(input)).toBe(false);
    }
    expect(repo.updateWorkspace).not.toHaveBeenCalled();
  });

  it("yönetici modu kapalıyken (müşteri / Vercel) tavan değişmez", async () => {
    vi.stubEnv("OPERATOR_MODE", "off");
    expect(await updateAgentSettings(VALID)).toMatchObject({ ok: false, code: "invalid_state" });
    vi.stubEnv("OPERATOR_MODE", "local");
    vi.stubEnv("VERCEL", "1");
    expect(await updateAgentSettings(VALID)).toMatchObject({ ok: false, code: "invalid_state" });
    expect(repo.updateWorkspace).not.toHaveBeenCalled();
  });

  it("genel ayar action'ı da ajan tavanını yönetici modu dışında kabul etmez", async () => {
    vi.stubEnv("OPERATOR_MODE", "off");
    expect(await updateWorkspaceSettings({ agentMonthlyCapUsd: 50 })).toMatchObject({ ok: false, code: "invalid_state" });
    expect(repo.updateWorkspace).not.toHaveBeenCalled();
  });
});
