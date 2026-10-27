/** Üretim saati action'ı: operatör kapısı, girdi doğrulaması, çalışma alanı → stüdyo eşlemesi. Dosya yazımı sahtedir (kural `production-time.test.ts`'te). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPanelContext: vi.fn(),
  revalidatePath: vi.fn(),
  isOperatorMode: vi.fn(),
  listWorkspaces: vi.fn(),
  setOrderProductionTime: vi.fn(),
}));

vi.mock("@/lib/data", () => ({ getPanelContext: mocks.getPanelContext }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/workspace/operator-mode", () => ({ isOperatorMode: mocks.isOperatorMode }));
vi.mock("@/lib/workspace/registry", () => ({ listWorkspaces: mocks.listWorkspaces }));
vi.mock("@/lib/studio-order/production-time", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/studio-order/production-time")>()),
  setOrderProductionTime: mocks.setOrderProductionTime,
}));

import { setOrderProductionTimeAction } from "@/app/actions/production-time";
import { ProductionTimeError } from "@/lib/studio-order/production-time";

const WS = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-20T09:00:00.000Z");
const input = { siparisId: "ornek-studyo-2026-10-19-s1", stamp: "2026-10-21 09:30" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isOperatorMode.mockReturnValue(true);
  mocks.getPanelContext.mockResolvedValue({ wsId: WS, now: NOW });
  mocks.listWorkspaces.mockResolvedValue([{ id: WS, name: "AI Scale", slug: "ornekstudyoapp", accounts: [] }]);
  mocks.setOrderProductionTime.mockReturnValue({ path: "x", ticket: {} });
});

describe("setOrderProductionTimeAction", () => {
  it("operatör modu kapalıysa yazmaz", async () => {
    mocks.isOperatorMode.mockReturnValue(false);
    expect(await setOrderProductionTimeAction(input)).toMatchObject({ ok: false, code: "invalid_state" });
    expect(mocks.setOrderProductionTime).not.toHaveBeenCalled();
  });

  it("geçersiz girdiyi (fazla alan, bozuk saat) reddeder", async () => {
    expect(await setOrderProductionTimeAction({ ...input, hesap: "x" })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await setOrderProductionTimeAction({ ...input, stamp: "yarın" })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await setOrderProductionTimeAction(null)).toMatchObject({ ok: false, code: "invalid_input" });
    expect(mocks.setOrderProductionTime).not.toHaveBeenCalled();
  });

  it("çalışma alanı slug'ını stüdyo hesabına çevirip yazar", async () => {
    expect(await setOrderProductionTimeAction(input)).toEqual({ ok: true, stamp: input.stamp });
    expect(mocks.setOrderProductionTime).toHaveBeenCalledWith(expect.objectContaining({ studioSlug: "ornek-studyo", siparisId: input.siparisId, stamp: input.stamp, now: NOW }));
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("stüdyoda tanımsız hesapta yazmaz", async () => {
    mocks.listWorkspaces.mockResolvedValue([{ id: WS, name: "Ornek", slug: "ornek", accounts: [] }]);
    expect(await setOrderProductionTimeAction(input)).toMatchObject({ ok: false, code: "invalid_state" });
    expect(mocks.setOrderProductionTime).not.toHaveBeenCalled();
  });

  it("kural hatasını koduyla iletir", async () => {
    mocks.setOrderProductionTime.mockImplementation(() => {
      throw new ProductionTimeError("invalid_state", "Bu sipariş artık taslak değil.");
    });
    expect(await setOrderProductionTimeAction(input)).toEqual({ ok: false, code: "invalid_state", message: "Bu sipariş artık taslak değil." });
  });
});
