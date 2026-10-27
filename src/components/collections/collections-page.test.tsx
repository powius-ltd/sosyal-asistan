// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/collections", () => ({
  createCollectionAction: vi.fn(),
  renameCollectionAction: vi.fn(),
  deleteCollectionAction: vi.fn(),
  removeFromCollectionAction: vi.fn(),
  updateCollectionItemNoteAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

import CollectionsPage from "@/app/(panel)/koleksiyonlar/page";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getPanelContext } from "@/lib/data";
import { formatNumber } from "@/lib/format";

/** Sayfayı gerçek (mock) depoyla çizer: `?id=` yoksa liste, varsa ayrıntı. */
async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  const element = await CollectionsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) });
  return render(<TooltipProvider>{element}</TooltipProvider>);
}

const created: string[] = [];
afterEach(async () => {
  const { repo, wsId } = await getPanelContext();
  for (const id of created.splice(0)) await repo.deleteCollection(wsId, id);
});

describe("/koleksiyonlar sayfası", () => {
  it("liste: her koleksiyon için ad bağlantısı (?id=), içerik sayısı ve satır işlemleri", async () => {
    const { repo, wsId } = await getPanelContext();
    const collections = await repo.listCollections(wsId);
    expect(collections.length, "seed: koleksiyon var").toBeGreaterThan(0);

    await renderPage();

    expect(screen.getByRole("heading", { name: "Koleksiyonlar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yeni koleksiyon" })).toBeInTheDocument();
    for (const collection of collections) {
      const link = screen.getByRole("link", { name: collection.name });
      expect(link).toHaveAttribute("href", `/koleksiyonlar?id=${encodeURIComponent(collection.id)}`);
      const row = link.closest("tr");
      if (!row) throw new Error("satır yok");
      expect(within(row).getAllByText(formatNumber(collection.itemCount) as string).length).toBeGreaterThan(0);
      expect(within(row).getByRole("button", { name: `Yeniden adlandır: ${collection.name}` })).toBeInTheDocument();
      expect(within(row).getByRole("button", { name: `Sil: ${collection.name}` })).toBeInTheDocument();
    }
  });

  it("ayrıntı: içerikler Video analizi bağlantısıyla, hesap/platform/biçim/lift ve not; Faz 2 düğmesi devre dışı", async () => {
    const { repo, wsId } = await getPanelContext();
    const withItems = (await repo.listCollections(wsId)).find((c) => c.itemCount > 0);
    if (!withItems) throw new Error("seed: öğeli koleksiyon yok");
    const detail = await repo.getCollection(wsId, withItems.id);
    if (!detail) throw new Error("koleksiyon okunamadı");

    await renderPage({ id: withItems.id });

    expect(screen.getByRole("heading", { name: withItems.name })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Koleksiyonlar" })).toHaveAttribute("href", "/koleksiyonlar");
    const evidence = screen.getByRole("button", { name: "Fikir için kanıt olarak kullan" });
    expect(evidence).toBeDisabled();

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(detail.items.length);
    detail.items.forEach((item, index) => {
      const row = rows[index];
      expect(within(row).getByText(`@${item.content.ownerHandle}`)).toBeInTheDocument();
      expect(within(row).getAllByRole("link").some((a) => a.getAttribute("href") === `/video/${encodeURIComponent(item.contentId)}`)).toBe(true);
      expect(within(row).getByRole("button", { name: /^Koleksiyondan çıkar:/ })).toBeInTheDocument();
      if (item.note) expect(within(row).getByText(item.note)).toBeInTheDocument();
      else expect(within(row).getByRole("button", { name: "Not ekle" })).toBeInTheDocument();
      if (item.content.currentLift === undefined) expect(within(row).getByText("—")).toBeInTheDocument(); // ölçülemeyen lift 0 değil
    });
  });

  it("boş koleksiyon: yönlendiren boş durum", async () => {
    const { repo, wsId } = await getPanelContext();
    const empty = await repo.createCollection(wsId, { name: `Boş test ${Math.random().toString(36).slice(2, 8)}` });
    created.push(empty.id);

    await renderPage({ id: empty.id });

    expect(screen.getByText("Bu koleksiyon boş")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tutan içeriklere git" })).toHaveAttribute("href", "/tutanlar");
  });

  it("bilinmeyen id: 'bulunamadı' ekranı ve listeye dönüş", async () => {
    await renderPage({ id: "col_yok" });
    expect(screen.getByText("Bu koleksiyon yok")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Koleksiyonlara dön" })).toHaveAttribute("href", "/koleksiyonlar");
  });

  it("boş id parametresi listeyi gösterir (çökmez)", async () => {
    await renderPage({ id: ["", "başka"] });
    expect(screen.getByRole("heading", { name: "Koleksiyonlar" })).toBeInTheDocument();
  });
});
