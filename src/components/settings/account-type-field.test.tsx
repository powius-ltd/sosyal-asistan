// @vitest-environment jsdom
/** Hesap türü değişimi onaylıdır (D3-18): "Türü kaydet" önce "Bundan sonra plan ve analiz şöyle değişir" penceresini açar. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateAccountType, toast } = vi.hoisted(() => ({ updateAccountType: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/actions/account-type-settings", () => ({ updateAccountType }));
vi.mock("sonner", () => ({ toast }));

import { AccountTypeField } from "@/components/settings/account-type-field";

beforeEach(() => {
  vi.clearAllMocks();
  updateAccountType.mockResolvedValue({ ok: true });
});

async function pickCreator(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: "Hesap türü" }));
  await user.click(await screen.findByRole("option", { name: "İçerik üreticisi" }));
}

describe("AccountTypeField", () => {
  it("seçim kaydetmez: onay penceresi sonucu söyler, onaylayınca kaydeder", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AccountTypeField accountType="business" />);
    await pickCreator(user);
    await user.click(screen.getByRole("button", { name: "Türü kaydet" }));
    expect(updateAccountType).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Bundan sonra plan ve analiz şöyle değişir/)).toBeInTheDocument();
    expect(within(dialog).getByTestId("account-type-confirm-effects")).toHaveTextContent(/konu \+ açılış/);
    expect(within(dialog).getByTestId("account-type-confirm-effects")).toHaveTextContent(/Kreatif anatomisi ekranı/);

    await user.click(within(dialog).getByRole("button", { name: "Türü değiştir" }));
    await waitFor(() => expect(updateAccountType).toHaveBeenCalledWith({ accountType: "creator" }));
    expect(toast.success).toHaveBeenCalledWith("Hesap türü kaydedildi.");
  });

  it("Vazgeç kaydetmez", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AccountTypeField accountType="business" />);
    await pickCreator(user);
    await user.click(screen.getByRole("button", { name: "Türü kaydet" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Vazgeç" }));
    expect(updateAccountType).not.toHaveBeenCalled();
  });

  it("müşteri açıklaması düz dildedir (matris / açı etiketlemesi yok); yönetici teknik satırı görür", () => {
    const { unmount } = render(<AccountTypeField accountType="business" />);
    expect(screen.getByTestId("account-type-effects").textContent).not.toMatch(/Matris|etiketlemesi|×/);
    unmount();
    render(<AccountTypeField accountType="business" operator />);
    expect(screen.getByTestId("account-type-effects").textContent).toMatch(/Matris:/);
  });
});
