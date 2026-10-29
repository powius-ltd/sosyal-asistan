/** Plan onayı action'ı: girdi doğrulama, çalışma alanı + saat bağlamdan, hata çevirisi, başarıda yeniden çizim. Kural `approveWeeklyPlan`'dadır (sözleşme süiti). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPanelContext: vi.fn(), revalidatePath: vi.fn(), approveWeeklyPlan: vi.fn() }));

vi.mock("@/lib/data", () => ({ getPanelContext: mocks.getPanelContext }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { approveWeeklyPlanAction } from "@/app/actions/weekly-plan";
import { RepositoryError } from "@/lib/data/repository";

const WS = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-29T09:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPanelContext.mockResolvedValue({ repo: { approveWeeklyPlan: mocks.approveWeeklyPlan }, wsId: WS, now: NOW });
});

describe("approveWeeklyPlanAction", () => {
  it("geçersiz girdiyi reddeder, depoya gitmez (fazladan alan dahil)", async () => {
    for (const bad of [null, {}, { weekStart: "bugün" }, { weekStart: "2026-10-26", workspaceId: "x" }]) {
      expect(await approveWeeklyPlanAction(bad)).toMatchObject({ ok: false, code: "invalid_input" });
    }
    expect(mocks.approveWeeklyPlan).not.toHaveBeenCalled();
  });

  it("başarıda çalışma alanı ve saati bağlamdan geçirir, onay anını döner ve yeniden çizer", async () => {
    mocks.approveWeeklyPlan.mockResolvedValue({ approvedAt: NOW.toISOString() });
    expect(await approveWeeklyPlanAction({ weekStart: "2026-10-26" })).toEqual({ ok: true, approvedAt: NOW.toISOString() });
    expect(mocks.approveWeeklyPlan).toHaveBeenCalledWith(WS, "2026-10-26", NOW);
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("plan yok / hazır değil durumlarını düz Türkçe mesaja çevirir", async () => {
    mocks.approveWeeklyPlan.mockRejectedValueOnce(new RepositoryError("not_found", "x"));
    expect(await approveWeeklyPlanAction({ weekStart: "2026-10-26" })).toMatchObject({ ok: false, code: "not_found", message: expect.stringContaining("plan bulunamadı") });
    mocks.approveWeeklyPlan.mockRejectedValueOnce(new RepositoryError("invalid_state", "x"));
    expect(await approveWeeklyPlanAction({ weekStart: "2026-10-26" })).toMatchObject({ ok: false, code: "invalid_state", message: expect.stringContaining("hazır değil") });
  });
});
