// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateCollectionItemNoteAction, removeFromCollectionAction, toast } = vi.hoisted(() => ({
  updateCollectionItemNoteAction: vi.fn(),
  removeFromCollectionAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/app/actions/collections", () => ({ updateCollectionItemNoteAction, removeFromCollectionAction }));
vi.mock("sonner", () => ({ toast }));

import { ItemNote } from "@/components/collections/item-note";
import { RemoveItemButton } from "@/components/collections/remove-item-button";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ItemNote", () => {
  it("not yoksa 'Not yok.' + 'Not ekle'; varsa metin + 'Notu düzenle'", () => {
    const { unmount } = render(<ItemNote collectionId="col_1" contentId="ci_1" />);
    expect(screen.getByText("Not yok.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not ekle" })).toBeInTheDocument();
    unmount();

    render(<ItemNote collectionId="col_1" contentId="ci_1" note="Açılış cümlesi güçlü" />);
    expect(screen.getByText("Açılış cümlesi güçlü")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notu düzenle" })).toBeInTheDocument();
  });

  it("düzenle → mevcut metinle açılır → kaydedince action'ı çağırır, toast gösterir ve görünüme döner", async () => {
    updateCollectionItemNoteAction.mockResolvedValue({ ok: true, message: "Not kaydedildi." });
    const user = userEvent.setup();
    render(<ItemNote collectionId="col_1" contentId="ci_1" note="Eski not" />);

    await user.click(screen.getByRole("button", { name: "Notu düzenle" }));
    const field = screen.getByLabelText("Not");
    expect(field).toHaveValue("Eski not");
    await user.clear(field);
    await user.type(field, "Yeni not");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Not kaydedildi."));
    expect(updateCollectionItemNoteAction).toHaveBeenCalledWith({ collectionId: "col_1", contentId: "ci_1", note: "Yeni not" });
    expect(screen.queryByLabelText("Not")).not.toBeInTheDocument();
  });

  it("boş metinle kaydetmek notu siler (note: '')", async () => {
    updateCollectionItemNoteAction.mockResolvedValue({ ok: true, message: "Not silindi." });
    const user = userEvent.setup();
    render(<ItemNote collectionId="col_1" contentId="ci_1" note="Silinecek" />);
    await user.click(screen.getByRole("button", { name: "Notu düzenle" }));
    await user.clear(screen.getByLabelText("Not"));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(updateCollectionItemNoteAction).toHaveBeenCalledWith({ collectionId: "col_1", contentId: "ci_1", note: "" }));
  });

  it("hata → toast.error ve düzenleme açık kalır; Vazgeç değişikliği atar", async () => {
    updateCollectionItemNoteAction.mockResolvedValue({ ok: false, code: "not_found", message: "Bu içerik artık koleksiyonda değil. Sayfayı yenile." });
    const user = userEvent.setup();
    render(<ItemNote collectionId="col_1" contentId="ci_1" note="Not" />);

    await user.click(screen.getByRole("button", { name: "Notu düzenle" }));
    await user.type(screen.getByLabelText("Not"), " eklendi");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Bu içerik artık koleksiyonda değil. Sayfayı yenile."));
    expect(screen.getByLabelText("Not")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.getByText("Not")).toBeInTheDocument();
    expect(screen.queryByLabelText("Not")).not.toBeInTheDocument();
  });
});

describe("RemoveItemButton", () => {
  it("çıkarır ve toast gösterir", async () => {
    removeFromCollectionAction.mockResolvedValue({ ok: true, message: "İçerik koleksiyondan çıkarıldı." });
    const user = userEvent.setup();
    render(<RemoveItemButton collectionId="col_1" contentId="ci_1" label="Kahve demleme" />);
    await user.click(screen.getByRole("button", { name: "Koleksiyondan çıkar: Kahve demleme" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("İçerik koleksiyondan çıkarıldı."));
    expect(removeFromCollectionAction).toHaveBeenCalledWith({ collectionId: "col_1", contentId: "ci_1" });
  });

  it("hata mesajını gösterir", async () => {
    removeFromCollectionAction.mockResolvedValue({ ok: false, code: "not_found", message: "Koleksiyon bulunamadı; silinmiş olabilir. Sayfayı yenile." });
    const user = userEvent.setup();
    render(<RemoveItemButton collectionId="col_1" contentId="ci_1" label="x" />);
    await user.click(screen.getByRole("button", { name: /Koleksiyondan çıkar/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("silinmiş olabilir")));
  });
});
