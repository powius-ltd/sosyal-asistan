// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createCollectionAction, renameCollectionAction, deleteCollectionAction, toast, router } = vi.hoisted(() => ({
  createCollectionAction: vi.fn(),
  renameCollectionAction: vi.fn(),
  deleteCollectionAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("@/app/actions/collections", () => ({ createCollectionAction, renameCollectionAction, deleteCollectionAction }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { CreateCollectionDialog, RenameCollectionDialog } from "@/components/collections/collection-name-dialogs";
import { DeleteCollectionDialog } from "@/components/collections/delete-collection-dialog";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreateCollectionDialog", () => {
  async function open() {
    const user = userEvent.setup();
    render(<CreateCollectionDialog />);
    await user.click(screen.getByRole("button", { name: "Yeni koleksiyon" }));
    return { user, name: await screen.findByLabelText("Ad") };
  }

  it("ad boşken Oluştur kapalıdır; yazınca açılır", async () => {
    const { user, name } = await open();
    expect(screen.getByRole("button", { name: "Oluştur" })).toBeDisabled();
    await user.type(name, "   ");
    expect(screen.getByRole("button", { name: "Oluştur" })).toBeDisabled();
    await user.type(name, "Hook ilhamı");
    expect(screen.getByRole("button", { name: "Oluştur" })).toBeEnabled();
  });

  it("sınırı aşan adı sessizce kesmez: sayaç ve mesaj görünür, Oluştur kapanır (D3-22)", async () => {
    const { user, name } = await open();
    await user.click(name);
    await user.paste("a".repeat(120));
    expect(name).toHaveValue("a".repeat(120));
    expect(screen.getByText("120 / 60")).toBeInTheDocument();
    expect(screen.getByText(/Ad en fazla 60 karakter olabilir; 60 karakter fazla/)).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Oluştur" })).toBeDisabled();
  });

  it("ad + açıklamayla action'ı çağırır, başarıda toast gösterip kapanır", async () => {
    createCollectionAction.mockResolvedValue({ ok: true, message: "“Hook ilhamı” koleksiyonu oluşturuldu.", collection: { id: "col_1", name: "Hook ilhamı" }, saved: false });
    const { user, name } = await open();
    await user.type(name, "Hook ilhamı");
    await user.type(screen.getByLabelText("Açıklama (isteğe bağlı)"), "Açılış örnekleri");
    await user.click(screen.getByRole("button", { name: "Oluştur" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("“Hook ilhamı” koleksiyonu oluşturuldu."));
    expect(createCollectionAction).toHaveBeenCalledWith({ name: "Hook ilhamı", description: "Açılış örnekleri" });
    await waitFor(() => expect(screen.queryByLabelText("Ad")).not.toBeInTheDocument());
  });

  it("boş açıklamayı göndermez; Enter ile de gönderir", async () => {
    createCollectionAction.mockResolvedValue({ ok: true, message: "ok" });
    const { user, name } = await open();
    await user.type(name, "Kurgu{Enter}");
    await waitFor(() => expect(createCollectionAction).toHaveBeenCalledWith({ name: "Kurgu", description: undefined }));
  });

  it("hata (already_exists) → toast.error ve dialog açık kalır, yazılan ad korunur", async () => {
    createCollectionAction.mockResolvedValue({ ok: false, code: "already_exists", message: "“Kurgu” adlı bir koleksiyon zaten var." });
    const { user, name } = await open();
    await user.type(name, "Kurgu");
    await user.click(screen.getByRole("button", { name: "Oluştur" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("“Kurgu” adlı bir koleksiyon zaten var."));
    expect(screen.getByLabelText("Ad")).toHaveValue("Kurgu");
  });
});

describe("RenameCollectionDialog", () => {
  it("mevcut adla açılır; yeni adı gönderir", async () => {
    renameCollectionAction.mockResolvedValue({ ok: true, message: "Koleksiyon “Yeni” olarak yeniden adlandırıldı." });
    const user = userEvent.setup();
    render(<RenameCollectionDialog collectionId="col_1" name="Eski" />);
    await user.click(screen.getByRole("button", { name: "Yeniden adlandır: Eski" }));

    const input = await screen.findByLabelText("Ad");
    expect(input).toHaveValue("Eski");
    await user.clear(input);
    await user.type(input, "Yeni");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(renameCollectionAction).toHaveBeenCalledWith({ collectionId: "col_1", name: "Yeni" }));
    expect(toast.success).toHaveBeenCalledWith("Koleksiyon “Yeni” olarak yeniden adlandırıldı.");
  });

  it("hata mesajını toast ile gösterir ve dialog açık kalır", async () => {
    renameCollectionAction.mockResolvedValue({ ok: false, code: "already_exists", message: "“Kurgu” adlı bir koleksiyon zaten var." });
    const user = userEvent.setup();
    render(<RenameCollectionDialog collectionId="col_1" name="Eski" />);
    await user.click(screen.getByRole("button", { name: "Yeniden adlandır: Eski" }));
    const input = await screen.findByLabelText("Ad");
    await user.clear(input);
    await user.type(input, "Kurgu");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("“Kurgu” adlı bir koleksiyon zaten var."));
    expect(screen.getByLabelText("Ad")).toBeInTheDocument();
  });
});

describe("DeleteCollectionDialog", () => {
  it("onay ister: kayıt sayısını ve içeriklerin silinmeyeceğini söyler; onaylamadan action çağrılmaz", async () => {
    const user = userEvent.setup();
    render(<DeleteCollectionDialog collectionId="col_1" name="Hook ilhamı" itemCount={12} />);
    await user.click(screen.getByRole("button", { name: "Sil: Hook ilhamı" }));

    expect(await screen.findByText(/“Hook ilhamı” koleksiyonu ve içindeki 12 kayıt silinecek/)).toBeInTheDocument();
    expect(screen.getByText(/videolar\) silinmez/)).toBeInTheDocument();
    expect(deleteCollectionAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(deleteCollectionAction).not.toHaveBeenCalled();
  });

  it("onaylayınca siler; redirectTo varsa listeye yönlendirir", async () => {
    deleteCollectionAction.mockResolvedValue({ ok: true, message: "Koleksiyon silindi." });
    const user = userEvent.setup();
    render(<DeleteCollectionDialog collectionId="col_1" name="Hook ilhamı" itemCount={0} redirectTo="/koleksiyonlar" />);
    await user.click(screen.getByRole("button", { name: "Sil: Hook ilhamı" }));
    await user.click(await screen.findByRole("button", { name: "Sil" }));

    await waitFor(() => expect(deleteCollectionAction).toHaveBeenCalledWith({ collectionId: "col_1" }));
    expect(toast.success).toHaveBeenCalledWith("Koleksiyon silindi.");
    expect(router.replace).toHaveBeenCalledWith("/koleksiyonlar");
  });

  it("hata → toast.error, yönlendirme yok", async () => {
    deleteCollectionAction.mockResolvedValue({ ok: false, code: "not_found", message: "Koleksiyon bulunamadı; silinmiş olabilir. Sayfayı yenile." });
    const user = userEvent.setup();
    render(<DeleteCollectionDialog collectionId="col_1" name="Hook ilhamı" itemCount={0} redirectTo="/koleksiyonlar" />);
    await user.click(screen.getByRole("button", { name: "Sil: Hook ilhamı" }));
    await user.click(await screen.findByRole("button", { name: "Sil" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("silinmiş olabilir")));
    expect(router.replace).not.toHaveBeenCalled();
  });
});
