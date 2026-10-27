// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/app/actions/studio-orders", () => ({ createStudioOrderAction: create }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

import { TicketButton } from "@/components/studio-order/ticket-button";

beforeEach(() => vi.clearAllMocks());

describe("TicketButton", () => {
  it("fişi yoksa 'Fiş hazırla': action'ı fikirle çağırır, sonra fiş sayfasına gider", async () => {
    create.mockResolvedValue({ ok: true, orderId: "so_9", created: true });
    render(<TicketButton ideaId="idea_1" />);
    await userEvent.click(screen.getByRole("button", { name: "Fiş hazırla" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/fis/so_9"));
    expect(create).toHaveBeenCalledWith("idea_1");
  });

  it("action hata verirse mesaj gösterilir, sayfa değişmez", async () => {
    create.mockResolvedValue({ ok: false, code: "invalid_state", message: "Fiş hazırlanamadı." });
    render(<TicketButton ideaId="idea_1" />);
    await userEvent.click(screen.getByRole("button", { name: "Fiş hazırla" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Fiş hazırlanamadı."));
    expect(push).not.toHaveBeenCalled();
  });

  it("fişi varsa 'Fişi aç': fiş sayfasına bağlantı, action çağrılmaz", () => {
    render(<TicketButton ideaId="idea_1" orderId="so_3" />);
    const link = screen.getByRole("link", { name: "Fişi aç" });
    expect(link).toHaveAttribute("href", "/fis/so_3");
    expect(link).toHaveClass("min-h-tap", "md:min-h-0");
    expect(screen.queryByRole("button", { name: "Fiş hazırla" })).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});
