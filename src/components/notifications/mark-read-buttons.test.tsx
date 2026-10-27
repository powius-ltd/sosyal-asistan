// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { markNotificationReadAction, markAllNotificationsReadAction, toast } = vi.hoisted(() => ({
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/app/actions/notifications", () => ({ markNotificationReadAction, markAllNotificationsReadAction }));
vi.mock("sonner", () => ({ toast }));

import { MarkAllReadButton, MarkReadButton } from "@/components/notifications/mark-read-buttons";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MarkReadButton", () => {
  it("bildirim kimliğiyle action'ı çağırır", async () => {
    markNotificationReadAction.mockResolvedValue({ ok: true, id: "nt_03" });
    const user = userEvent.setup();
    render(<MarkReadButton id="nt_03" title="Rakip tuttu" />);
    await user.click(screen.getByRole("button", { name: "Okundu yap: Rakip tuttu" }));
    await waitFor(() => expect(markNotificationReadAction).toHaveBeenCalledWith({ id: "nt_03" }));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("hatada sunucu mesajını toast ile gösterir", async () => {
    markNotificationReadAction.mockResolvedValue({ ok: false, code: "not_found", message: "Bildirim bulunamadı; silinmiş olabilir. Sayfayı yenile." });
    const user = userEvent.setup();
    render(<MarkReadButton id="nt_yok" title="Rakip tuttu" />);
    await user.click(screen.getByRole("button", { name: "Okundu yap: Rakip tuttu" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Bildirim bulunamadı; silinmiş olabilir. Sayfayı yenile."));
  });
});

describe("MarkAllReadButton", () => {
  it("okunmamış yoksa devre dışıdır", () => {
    render(<MarkAllReadButton unreadCount={0} />);
    expect(screen.getByRole("button", { name: "Tümünü okundu yap" })).toBeDisabled();
  });

  it("tıklanınca action'ı çağırır ve yapılan sayıyı bildirir", async () => {
    markAllNotificationsReadAction.mockResolvedValue({ ok: true, marked: 6 });
    const user = userEvent.setup();
    render(<MarkAllReadButton unreadCount={6} />);
    await user.click(screen.getByRole("button", { name: "Tümünü okundu yap" }));
    await waitFor(() => expect(markAllNotificationsReadAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("6 bildirim okundu yapıldı."));
  });

  it("hatada mesajı toast ile gösterir", async () => {
    markAllNotificationsReadAction.mockResolvedValue({ ok: false, code: "unknown", message: "Beklenmeyen bir hata oluştu. Lütfen tekrar dene." });
    const user = userEvent.setup();
    render(<MarkAllReadButton unreadCount={2} />);
    await user.click(screen.getByRole("button", { name: "Tümünü okundu yap" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Beklenmeyen bir hata oluştu. Lütfen tekrar dene."));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
