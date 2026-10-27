/** Reklam hedefi action'ı: operatör kapısı, katı girdi, hata çevirisi. Depo ve bağlam sahtedir. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPanelContext: vi.fn(),
  revalidatePath: vi.fn(),
  repo: { updateAdAccountGoal: vi.fn() },
}));

vi.mock("@/lib/data", () => ({ getPanelContext: mocks.getPanelContext }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { updateAdGoalAction } from "@/app/actions/ads";
import { RepositoryError } from "@/lib/data/repository";

const WS = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "ad100000-0000-4000-8000-000000000001";
const GOAL = { kind: "cost", resultLabel: "mesaj", targetCostPerResult: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPERATOR_MODE", "local");
  mocks.getPanelContext.mockResolvedValue({ repo: mocks.repo, wsId: WS, now: new Date() });
  mocks.repo.updateAdAccountGoal.mockResolvedValue({ id: ACCOUNT });
});

describe("updateAdGoalAction", () => {
  it("yönetici modu kapalıyken invalid_state döner ve depoya dokunmaz", async () => {
    vi.stubEnv("OPERATOR_MODE", "off");
    const result = await updateAdGoalAction({ accountId: ACCOUNT, goal: GOAL });
    expect(result).toMatchObject({ ok: false, code: "invalid_state" });
    expect(mocks.getPanelContext).not.toHaveBeenCalled();
    expect(mocks.repo.updateAdAccountGoal).not.toHaveBeenCalled();
  });

  it("geçerli girdiyi çalışma alanıyla yazar ve sayfaları yeniler", async () => {
    const result = await updateAdGoalAction({ accountId: ACCOUNT, goal: GOAL });
    expect(result).toMatchObject({ ok: true });
    expect(mocks.repo.updateAdAccountGoal).toHaveBeenCalledWith(WS, { accountId: ACCOUNT, goal: GOAL });
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("çalışma alanı gövdeden alınmaz; bilinmeyen alan ve eksik hedef reddedilir", async () => {
    const extra = await updateAdGoalAction({ accountId: ACCOUNT, goal: GOAL, workspaceId: "x" });
    expect(extra).toMatchObject({ ok: false });
    const missing = await updateAdGoalAction({ accountId: ACCOUNT, goal: { kind: "cost", resultLabel: "x" } });
    expect(missing).toMatchObject({ ok: false });
    expect(mocks.repo.updateAdAccountGoal).not.toHaveBeenCalled();
  });

  it("depo hatasını Türkçe mesaja çevirir", async () => {
    mocks.repo.updateAdAccountGoal.mockRejectedValue(new RepositoryError("not_found", "x"));
    const result = await updateAdGoalAction({ accountId: ACCOUNT, goal: GOAL });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });
});
