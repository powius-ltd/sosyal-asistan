// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/data")>()), getPanelContext: async () => ctx.current }));

import TicketPage from "@/app/(panel)/fis/[id]/page";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { createOrderForIdea } from "@/lib/studio-order/create-for-idea";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const NOW = new Date("2026-09-30T09:00:00.000Z");

async function setup(kind?: "ugc" | "broll") {
  const repo = createMockRepository();
  ctx.current = { repo, wsId: WS, now: NOW };
  const idea = (await repo.listIdeas(WS)).find((i) => i.evidence.length > 0 && (i.scriptOutline.length > 0 || i.hooks.length > 0));
  if (!idea) throw new Error("tohumda uygun fikir yok");
  const { order } = await createOrderForIdea({ repo, wsId: WS, now: NOW, ideaId: idea.id, panelSlug: "ornek-marka", kind, note: "Sabah çekilsin." });
  return { repo, idea, order };
}

const renderPage = async (id: string) => render(<TooltipProvider>{await TicketPage({ params: Promise.resolve({ id }) })}</TooltipProvider>);

beforeEach(() => {
  ctx.current = undefined;
});

describe("/fis/[id]", () => {
  it("fiş alanları: başlık, üretim türü (ugc → UGC), durum, sütun, not; yazdır düğmesi ve sohbet ipucu", async () => {
    const { idea, order } = await setup("ugc");
    await renderPage(order.id);
    expect(screen.getAllByText(idea.title).length).toBeGreaterThan(0);
    expect(screen.getAllByText("UGC").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Taslak").length).toBeGreaterThan(0);
    expect(screen.getByText(order.ticket.sutun)).toBeInTheDocument();
    expect(screen.getByText(/Sabah çekilsin\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yazdır" })).toBeInTheDocument();
    expect(screen.getByText(/UGC olsun/)).toBeInTheDocument();
    // ölçülemeyen süre tire + sebep (0 değil)
    if (order.ticket.hedef_sure_sn === undefined) expect(screen.getByText("Bu fiş için süre belirlenmedi.")).toBeInTheDocument();
  });

  it("üretim türü etiketi tek yerden: broll → B-roll", async () => {
    const { order } = await setup("broll");
    await renderPage(order.id);
    expect(screen.getAllByText("B-roll").length).toBeGreaterThan(0);
  });

  it("'Neden bu fikir': gerekçe + dayandığı videolar + plandaki yön (fişte değil, fikirden okunur)", async () => {
    const { idea, order } = await setup();
    await renderPage(order.id);
    const why = screen.getByText("Neden bu fikir").closest("[data-slot=card]") as HTMLElement;
    expect(within(why).getByText(idea.rationale)).toBeInTheDocument();
    expect(within(why).getByText(/Dayandığı videolar/)).toBeInTheDocument();
    expect(within(why).getAllByRole("link").length).toBeGreaterThanOrEqual(1);
    expect(within(why).getByText("Plandaki yönü")).toBeInTheDocument();
  });

  it("bulunamayan fiş → notFound", async () => {
    await setup();
    await expect(renderPage("yok-boyle-bir-fis")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
