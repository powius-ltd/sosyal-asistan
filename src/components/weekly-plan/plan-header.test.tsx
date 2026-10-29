// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ approve: vi.fn(), refresh: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }));
vi.mock("@/app/actions/weekly-plan", () => ({ approveWeeklyPlanAction: mocks.approve }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));

import { PlanHeader } from "@/components/weekly-plan/plan-header";
import { makePlan } from "@/components/weekly-plan/test-fixtures";
import { PANEL_JARGON } from "@/lib/plain-language";

beforeEach(() => vi.clearAllMocks());

describe("PlanHeader · plan onayı", () => {
  it("hazır ve onaysız planda 'Planı onayla' düğmesi çıkar; basınca action çağrılır ve sayfa yenilenir", async () => {
    mocks.approve.mockResolvedValue({ ok: true, approvedAt: "2026-10-29T09:00:00.000Z" });
    const plan = makePlan();
    render(<PlanHeader plan={{ ...plan, status: "ready", approvedAt: undefined }} />);
    await userEvent.click(screen.getByRole("button", { name: "Planı onayla" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.approve).toHaveBeenCalledWith({ weekStart: plan.weekStart });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("action başarısızsa hata gösterilir, sayfa yenilenmez", async () => {
    mocks.approve.mockResolvedValue({ ok: false, code: "invalid_state", message: "Bu plan henüz hazır değil." });
    render(<PlanHeader plan={{ ...makePlan(), status: "ready", approvedAt: undefined }} />);
    await userEvent.click(screen.getByRole("button", { name: "Planı onayla" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Bu plan henüz hazır değil."));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("onaylı planda düğme yok, 'Onaylandı · tarih' rozeti var", () => {
    render(<PlanHeader plan={{ ...makePlan(), status: "ready", approvedAt: "2026-10-29T09:00:00.000Z" }} />);
    expect(screen.queryByRole("button", { name: "Planı onayla" })).toBeNull();
    expect(screen.getByText(/^Onaylandı · /)).toBeInTheDocument();
  });

  it("taslak planda onay düğmesi çıkmaz; onay metinlerinde panel jargonu yok", () => {
    render(<PlanHeader plan={{ ...makePlan(), status: "draft", approvedAt: undefined }} />);
    expect(screen.queryByRole("button", { name: "Planı onayla" })).toBeNull();
    const ready = render(<PlanHeader plan={{ ...makePlan(), status: "ready", approvedAt: undefined }} />);
    expect(ready.container.textContent ?? "").not.toMatch(PANEL_JARGON);
  });
});
