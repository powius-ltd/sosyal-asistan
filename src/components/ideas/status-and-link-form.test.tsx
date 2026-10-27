// @vitest-environment jsdom
/** Fikir kartı etkileşimleri (D2-12): "Ele" sonrası "Geri al", bağlantı alanı hatasının alanın altında görünmesi. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateIdeaStatusAction, linkIdeaToReelAction, toast } = vi.hoisted(() => ({
  updateIdeaStatusAction: vi.fn(),
  linkIdeaToReelAction: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/app/actions/ideas", () => ({ updateIdeaStatusAction }));
vi.mock("@/app/actions/idea-links", () => ({ linkIdeaToReelAction, resolveIdeaLinkAction: vi.fn(), unlinkIdeaAction: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { ReelLinkForm } from "@/components/ideas/reel-link-form";
import { StatusActions } from "@/components/ideas/status-actions";

beforeEach(() => {
  vi.clearAllMocks();
  updateIdeaStatusAction.mockImplementation(async ({ ideaId, status }: { ideaId: string; status: string }) => ({ ok: true, ideaId, status }));
});

describe("StatusActions: Ele → Geri al", () => {
  it("elenince baloncukta 'Geri al' çıkar; tıklayınca fikir önceki durumuna (Kaydedilen) döner", async () => {
    const user = userEvent.setup();
    render(<StatusActions ideaId="i1" status="saved" />);
    await user.click(screen.getByRole("button", { name: /Ele/ }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
    const [message, options] = toast.success.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(message).toBe("Fikir elendi.");
    expect(options.action.label).toBe("Geri al");
    expect(updateIdeaStatusAction).toHaveBeenLastCalledWith({ ideaId: "i1", status: "dismissed" });

    options.action.onClick();
    // Elenmişten yalnız "yeni"ye gidilir; oradan eski duruma (kayıtlıya).
    await waitFor(() => expect(updateIdeaStatusAction).toHaveBeenCalledTimes(3));
    expect(updateIdeaStatusAction.mock.calls.slice(1).map(([arg]) => arg.status)).toEqual(["new", "saved"]);
    await waitFor(() => expect(toast.success).toHaveBeenLastCalledWith("Fikir “Kaydedilen” durumuna döndü."));
  });

  it("diğer geçişlerde 'Geri al' yok (yalnız Ele onaysızdır)", async () => {
    const user = userEvent.setup();
    render(<StatusActions ideaId="i1" status="new" />);
    await user.click(screen.getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Fikir “Kaydedilen” durumuna taşındı."));
  });
});

describe("ReelLinkForm: hata alanın altında", () => {
  it("sunucu hatası alanın altında yazılır, alan hatalı işaretlenir ve odak ona döner; yazınca temizlenir", async () => {
    linkIdeaToReelAction.mockResolvedValue({ ok: false, code: "invalid_input", message: "Geçerli bir içerik bağlantısı yapıştır." });
    const user = userEvent.setup();
    render(<ReelLinkForm ideaId="i1" platform="instagram" />);
    const input = screen.getByLabelText("Bu fikir şu Reels oldu");

    await user.type(input, "https://example.com");
    await user.click(screen.getByRole("button", { name: "Bağla" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Geçerli bir içerik bağlantısı yapıştır.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
    expect(input).toHaveFocus();
    expect(toast.error).not.toHaveBeenCalled();

    await user.type(input, "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("TikTok hesabında alan adı 'video' der (Reels sızmaz)", () => {
    render(<ReelLinkForm ideaId="i1" platform="tiktok" />);
    expect(screen.getByLabelText("Bu fikir şu video oldu")).toBeInTheDocument();
  });
});
