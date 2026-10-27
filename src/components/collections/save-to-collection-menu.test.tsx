// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getContentCollectionsAction, addToCollectionAction, removeFromCollectionAction, createCollectionAction, toast } = vi.hoisted(() => ({
  getContentCollectionsAction: vi.fn(),
  addToCollectionAction: vi.fn(),
  removeFromCollectionAction: vi.fn(),
  createCollectionAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/app/actions/collections", () => ({
  getContentCollectionsAction,
  addToCollectionAction,
  removeFromCollectionAction,
  createCollectionAction,
}));
vi.mock("sonner", () => ({ toast }));

import { SaveToCollectionMenu } from "@/components/collections/save-to-collection-menu";

const COLLECTIONS = [
  { id: "col_1", name: "Hook ilhamı" },
  { id: "col_2", name: "Kurgu örnekleri" },
];

function loaded(memberIds: string[] = []) {
  getContentCollectionsAction.mockResolvedValue({ ok: true, collections: COLLECTIONS, memberIds });
}

async function openMenu(props: { initialCollectionIds?: string[] } = {}) {
  const user = userEvent.setup();
  render(<SaveToCollectionMenu contentId="ci_7" {...props} />);
  await user.click(screen.getByRole("button", { name: /^(Kaydet|Kaydedildi)$/ }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SaveToCollectionMenu", () => {
  it("üyelik yoksa 'Kaydet', varsa dolu ikon + 'Kaydedildi' gösterir", () => {
    const { unmount } = render(<SaveToCollectionMenu contentId="ci_7" initialCollectionIds={[]} />);
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeInTheDocument();
    expect(document.querySelector("svg.fill-current")).toBeNull();
    unmount();

    render(<SaveToCollectionMenu contentId="ci_7" initialCollectionIds={["col_1"]} />);
    const saved = screen.getByRole("button", { name: "Kaydedildi" });
    expect(saved.querySelector("svg")).toHaveClass("fill-current");
  });

  it("ilk odak not alanında değil, ilk koleksiyon kutusundadır (D3-22)", async () => {
    loaded();
    await openMenu();
    const first = await screen.findByRole("checkbox", { name: "Hook ilhamı" });
    await waitFor(() => expect(first).toHaveFocus());
    expect(screen.getByLabelText("Not (isteğe bağlı)")).not.toHaveFocus();
  });

  it("açılınca koleksiyonları yükler; üye olunanlar işaretli gelir", async () => {
    loaded(["col_2"]);
    await openMenu({ initialCollectionIds: ["col_2"] });

    expect(getContentCollectionsAction).toHaveBeenCalledWith({ contentId: "ci_7" });
    const hook = await screen.findByRole("checkbox", { name: "Hook ilhamı" });
    expect(hook).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Kurgu örnekleri" })).toBeChecked();
  });

  it("işaretsiz koleksiyona tıklayınca notla ekler, toast gösterir ve düğme 'Kaydedildi' olur", async () => {
    loaded([]);
    addToCollectionAction.mockResolvedValue({ ok: true, message: "İçerik koleksiyona eklendi." });
    const user = await openMenu({ initialCollectionIds: [] });

    await user.type(await screen.findByLabelText("Not (isteğe bağlı)"), "  açılış cümlesi  ");
    await user.click(await screen.findByRole("checkbox", { name: "Hook ilhamı" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("İçerik koleksiyona eklendi."));
    expect(addToCollectionAction).toHaveBeenCalledWith({ collectionId: "col_1", contentId: "ci_7", note: "açılış cümlesi" });
    expect(screen.getByRole("checkbox", { name: "Hook ilhamı" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Kaydedildi" })).toBeInTheDocument();
    expect(screen.getByLabelText("Not (isteğe bağlı)")).toHaveValue(""); // not başka koleksiyona sızmasın
  });

  it("not boşsa notu göndermez (dokunma)", async () => {
    loaded([]);
    addToCollectionAction.mockResolvedValue({ ok: true, message: "ok" });
    const user = await openMenu();
    await user.click(await screen.findByRole("checkbox", { name: "Kurgu örnekleri" }));
    await waitFor(() => expect(addToCollectionAction).toHaveBeenCalled());
    expect(addToCollectionAction).toHaveBeenCalledWith({ collectionId: "col_2", contentId: "ci_7", note: undefined });
  });

  it("işaretli koleksiyona tıklayınca çıkarır; son üyelik gidince düğme 'Kaydet'e döner", async () => {
    loaded(["col_1"]);
    removeFromCollectionAction.mockResolvedValue({ ok: true, message: "İçerik koleksiyondan çıkarıldı." });
    const user = await openMenu({ initialCollectionIds: ["col_1"] });

    await user.click(await screen.findByRole("checkbox", { name: "Hook ilhamı" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("İçerik koleksiyondan çıkarıldı."));
    expect(removeFromCollectionAction).toHaveBeenCalledWith({ collectionId: "col_1", contentId: "ci_7" });
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeInTheDocument();
  });

  it("ekleme başarısızsa toast.error gösterir ve işareti değiştirmez", async () => {
    loaded([]);
    addToCollectionAction.mockResolvedValue({ ok: false, code: "not_found", message: "Koleksiyon ya da içerik bulunamadı." });
    const user = await openMenu();
    await user.click(await screen.findByRole("checkbox", { name: "Hook ilhamı" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Koleksiyon ya da içerik bulunamadı."));
    expect(screen.getByRole("checkbox", { name: "Hook ilhamı" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeInTheDocument();
  });

  it("action fırlatırsa (ağ kopması) Türkçe hata toast'ı gösterir", async () => {
    loaded([]);
    addToCollectionAction.mockRejectedValue(new Error("fetch failed"));
    const user = await openMenu();
    await user.click(await screen.findByRole("checkbox", { name: "Hook ilhamı" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("İşlem tamamlanamadı")));
  });

  it("satır içi 'Yeni koleksiyon': oluşturur + içeriği kaydeder, listeye işaretli ekler", async () => {
    loaded([]);
    createCollectionAction.mockResolvedValue({
      ok: true,
      message: "“Yeni fikirler” koleksiyonu oluşturuldu ve içerik kaydedildi.",
      collection: { id: "col_9", name: "Yeni fikirler" },
      saved: true,
    });
    const user = await openMenu();
    await screen.findByRole("checkbox", { name: "Hook ilhamı" });

    await user.type(screen.getByLabelText("Yeni koleksiyon adı"), "Yeni fikirler{Enter}");

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("“Yeni fikirler” koleksiyonu oluşturuldu ve içerik kaydedildi."));
    expect(createCollectionAction).toHaveBeenCalledWith({ name: "Yeni fikirler", contentId: "ci_7", note: undefined });
    expect(screen.getByRole("checkbox", { name: "Yeni fikirler" })).toBeChecked();
    expect(screen.getByLabelText("Yeni koleksiyon adı")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Kaydedildi" })).toBeInTheDocument();
  });

  it("aynı adlı koleksiyon varsa (already_exists) sunucu mesajını gösterir ve ad alanı korunur", async () => {
    loaded([]);
    createCollectionAction.mockResolvedValue({ ok: false, code: "already_exists", message: "“Hook ilhamı” adlı bir koleksiyon zaten var." });
    const user = await openMenu();
    await screen.findByRole("checkbox", { name: "Hook ilhamı" });

    await user.type(screen.getByLabelText("Yeni koleksiyon adı"), "Hook ilhamı");
    await user.click(screen.getByRole("button", { name: "Koleksiyon oluştur ve kaydet" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("“Hook ilhamı” adlı bir koleksiyon zaten var."));
    expect(screen.getByLabelText("Yeni koleksiyon adı")).toHaveValue("Hook ilhamı");
  });

  it("boş ad ile oluşturma düğmesi kapalıdır", async () => {
    loaded([]);
    await openMenu();
    await screen.findByRole("checkbox", { name: "Hook ilhamı" });
    expect(screen.getByRole("button", { name: "Koleksiyon oluştur ve kaydet" })).toBeDisabled();
  });

  it("koleksiyon yoksa boş durum metni gösterir", async () => {
    getContentCollectionsAction.mockResolvedValue({ ok: true, collections: [], memberIds: [] });
    await openMenu();
    expect(await screen.findByText(/Henüz koleksiyon yok/)).toBeInTheDocument();
  });

  it("liste yüklenemezse hatayı gösterir", async () => {
    getContentCollectionsAction.mockResolvedValue({ ok: false, code: "unknown", message: "Beklenmeyen bir hata oluştu. Lütfen tekrar dene." });
    await openMenu();
    expect(await screen.findByRole("alert")).toHaveTextContent("Beklenmeyen bir hata oluştu.");
  });
});
