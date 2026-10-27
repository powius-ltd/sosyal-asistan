// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { addCompetitorAction, toast } = vi.hoisted(() => ({
  addCompetitorAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/app/actions/competitors", () => ({ addCompetitorAction }));
vi.mock("sonner", () => ({ toast }));

import { RIVAL_PLAIN } from "@/lib/plain-language-account";
import { AddCompetitorDialog } from "@/components/competitors/add-competitor-dialog";

async function openDialog(props: ComponentProps<typeof AddCompetitorDialog> = { operator: true }) {
  // delay: null → tuş vuruşları arasında setTimeout beklemesi yok (yoğun makinede yalancı zaman aşımı olmaz).
  const user = userEvent.setup({ delay: null });
  render(<AddCompetitorDialog {...props} />);
  await user.click(screen.getByRole("button", { name: /Rakip ekle/ }));
  const input = await screen.findByLabelText("Kullanıcı adı ya da bağlantı");
  return { user, input };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AddCompetitorDialog", () => {
  it("yazarken handle'ı canlı normalize eder; yönetici görünümünde maliyet notunu gösterir", async () => {
    const { user, input } = await openDialog();
    expect(screen.getByRole("button", { name: "Ekle" })).toBeDisabled();
    expect(screen.getByText(/~50 içerik ≈ \$0,12 \(Apify\)/)).toBeInTheDocument();

    // Uzun bağlantı tuş tuş yazılmaz (44 yeniden çizim + bekleme = kararsız); yapıştırma tek olaydır.
    await user.click(input);
    await user.paste("https://www.instagram.com/Kahve.Yeri/?hl=tr");
    expect(screen.getByText("@kahve.yeri")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ekle" })).toBeEnabled();
  });

  it("müşteri görünümünde tutar ve sağlayıcı adı yok; yerine kısa süre cümlesi (D3-08)", async () => {
    await openDialog({});
    const note = screen.getByTestId("add-note");
    expect(note).toHaveTextContent(RIVAL_PLAIN.addWait);
    expect(note.textContent).not.toMatch(/\$|Apify|maliyet|tavan/i);
  });

  it("kendi hesabını rakip olarak eklemeyi reddeder: mesaj görünür, gönderim kapalı (D3-17)", async () => {
    const { user, input } = await openDialog({ operator: false, ownAccounts: [{ platform: "instagram", handle: "Benim.Hesap" }] });
    await user.type(input, "@benim.hesap");
    expect(screen.getByText(RIVAL_PLAIN.ownHandle)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ekle" })).toBeDisabled();
  });

  it("geçersiz girdide hata mesajı gösterir ve gönderimi kapatır", async () => {
    const { user, input } = await openDialog();
    await user.type(input, "kahve yeri");
    expect(screen.getByText(/Geçersiz kullanıcı adı/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ekle" })).toBeDisabled();
  });

  it("gönderince action'ı çağırır, başarıda toast gösterip dialog'u kapatır", async () => {
    addCompetitorAction.mockResolvedValue({ ok: true, message: "@kahve takibe alındı." });
    const { user, input } = await openDialog();
    await user.type(input, "@Kahve");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("@kahve takibe alındı."));
    expect(addCompetitorAction).toHaveBeenCalledWith({ platform: "instagram", handle: "@Kahve" });
    await waitFor(() => expect(screen.queryByLabelText("Kullanıcı adı ya da bağlantı")).not.toBeInTheDocument());
  });

  it("hata dönerse toast.error gösterir ve dialog açık kalır", async () => {
    addCompetitorAction.mockResolvedValue({ ok: false, message: "@kahve zaten ekli." });
    const { user, input } = await openDialog();
    await user.type(input, "kahve");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("@kahve zaten ekli."));
    expect(screen.getByLabelText("Kullanıcı adı ya da bağlantı")).toBeInTheDocument();
  });
});
