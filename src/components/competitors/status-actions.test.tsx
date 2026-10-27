// @vitest-environment jsdom
/** "Yoksay" / "İzle" onaysız ve anındadır: baloncukta "Geri al", yoksayılmış satırda "Yeniden izle" (D3-17). */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { setCompetitorStatusAction, toast } = vi.hoisted(() => ({
  setCompetitorStatusAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/app/actions/competitors", () => ({ setCompetitorStatusAction }));
vi.mock("sonner", () => ({ toast }));

import { CompetitorStatusActions } from "@/components/competitors/status-actions";

type ToastOptions = { duration: number; action: { label: string; onClick: () => void } };

beforeEach(() => {
  vi.clearAllMocks();
  setCompetitorStatusAction.mockResolvedValue({ ok: true, message: "@kahve yoksayıldı." });
});

describe("CompetitorStatusActions", () => {
  it("yoksayınca baloncukta 'Geri al' çıkar ve önceki duruma döner", async () => {
    const user = userEvent.setup({ delay: null });
    render(<CompetitorStatusActions competitorId="cp_1" handle="kahve" allow={["ignored"]} restoreTo="tracked" />);
    await user.click(screen.getByRole("button", { name: "@kahve hesabını yoksay" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [message, options] = toast.success.mock.calls[0] as [string, ToastOptions];
    expect(message).toBe("@kahve yoksayıldı.");
    expect(options.action.label).toBe("Geri al");

    options.action.onClick();
    await waitFor(() => expect(setCompetitorStatusAction).toHaveBeenLastCalledWith({ competitorId: "cp_1", status: "tracked" }));
  });

  it("Keşfet'te izlemeye alınca 'Geri al' adaya döndürür", async () => {
    setCompetitorStatusAction.mockResolvedValue({ ok: true, message: "@kahve izlemeye alındı." });
    const user = userEvent.setup({ delay: null });
    render(<CompetitorStatusActions competitorId="cp_1" handle="kahve" allow={["tracked", "ignored"]} restoreTo="candidate" />);
    await user.click(screen.getByRole("button", { name: "@kahve hesabını izle" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const options = toast.success.mock.calls[0][1] as ToastOptions;
    options.action.onClick();
    await waitFor(() => expect(setCompetitorStatusAction).toHaveBeenLastCalledWith({ competitorId: "cp_1", status: "candidate" }));
  });

  it("yoksayılmış satırda düğme 'Yeniden izle'dir", () => {
    render(<CompetitorStatusActions competitorId="cp_1" handle="kahve" allow={["tracked"]} restoreTo="ignored" />);
    expect(screen.getByRole("button", { name: "@kahve hesabını yeniden izle" })).toHaveTextContent("Yeniden izle");
  });

  it("geri alınamayan durumda (gizli hesap) baloncukta eylem yoktur; düğmeler dar ekranda 48 px", async () => {
    const user = userEvent.setup({ delay: null });
    render(<CompetitorStatusActions competitorId="cp_1" handle="kahve" allow={["ignored"]} />);
    const button = screen.getByRole("button", { name: "@kahve hesabını yoksay" });
    expect(button).toHaveClass("min-h-tap");
    await user.click(button);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("@kahve yoksayıldı."));
  });
});
