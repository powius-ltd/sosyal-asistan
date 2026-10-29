/** Otomatik iş action'ı: girdi doğrulama, barındırılan ortamda kapalı, doğru yama alanı, hata çevirisi. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPanelContext: vi.fn(), revalidatePath: vi.fn(), updateWorkspace: vi.fn() }));
vi.mock("@/lib/data", () => ({ getPanelContext: mocks.getPanelContext }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { setAutomationAction } from "@/app/actions/automation";
import { RepositoryError } from "@/lib/data/repository";

const WS = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPanelContext.mockResolvedValue({ repo: { updateWorkspace: mocks.updateWorkspace }, wsId: WS, now: new Date("2026-10-20T09:00:00.000Z") });
  mocks.updateWorkspace.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());

describe("setAutomationAction", () => {
  it("geçersiz girdiyi reddeder, depoya gitmez", async () => {
    for (const bad of [null, "", {}, { key: "weeklyPlan" }, { key: "x", enabled: true }, { key: "measure", enabled: "evet" }, { key: "measure", enabled: true, ek: 1 }]) {
      expect(await setAutomationAction(bad)).toMatchObject({ ok: false, code: "invalid_input" });
    }
    expect(mocks.updateWorkspace).not.toHaveBeenCalled();
  });

  it("anahtarı doğru yama alanına yazar ve yeniden çizer; çalışma alanı bağlamdan gelir", async () => {
    expect(await setAutomationAction({ key: "weeklyPlan", enabled: false })).toEqual({ ok: true });
    expect(mocks.updateWorkspace).toHaveBeenCalledWith(WS, { autoWeeklyPlan: false });
    expect(await setAutomationAction({ key: "measure", enabled: true })).toEqual({ ok: true });
    expect(mocks.updateWorkspace).toHaveBeenLastCalledWith(WS, { autoMeasure: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/otomatik");
  });

  it("üretim henüz hazır değilken açılamaz", async () => {
    expect(await setAutomationAction({ key: "produce", enabled: true })).toMatchObject({ ok: false, code: "invalid_state" });
    expect(mocks.updateWorkspace).not.toHaveBeenCalled();
  });

  it("barındırılan ortamda (VERCEL) kapalıdır", async () => {
    vi.stubEnv("VERCEL", "1");
    expect(await setAutomationAction({ key: "measure", enabled: false })).toMatchObject({ ok: false, code: "invalid_state" });
    expect(mocks.updateWorkspace).not.toHaveBeenCalled();
  });

  it("depo hatasını Türkçe sonuca çevirir", async () => {
    mocks.updateWorkspace.mockRejectedValue(new RepositoryError("not_found", "yok"));
    expect(await setAutomationAction({ key: "measure", enabled: false })).toMatchObject({ ok: false, code: "not_found" });
  });
});
