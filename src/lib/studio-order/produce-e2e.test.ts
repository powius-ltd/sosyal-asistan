/**
 * SPN-33 uçtan uca (SAHTE stüdyo, geçici kök): panel fişi → `sendOrderToStudio` (onay: evet) → sahte stüdyo `uretildi` + final.mp4 →
 * `returnOrders({ onlyOrderId })` → yayın satırı `awaiting_approval` + panel fişi `uretildi`. Hata dalında fiş `hata`.
 * Gerçek üretim, ses, Zernio yok; gerçek sipariş klasörüne dokunulmaz.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMockRepository } from "@/lib/data/mock/mock-repository";
import type { CreatePublishJobInput } from "@/lib/data/queries";
import type { PanelRepository } from "@/lib/data/repository";
import { returnOrders, type OrderReturnStore } from "@/lib/publish/order-return";
import { sendOrderToStudio } from "@/lib/studio-order/send-to-studio";
import { readTicket, writeTicket } from "@/lib/studio-order/ticket-file";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const NOW = new Date("2026-10-28T09:00:00.000Z");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function newOrder(repo: PanelRepository) {
  const idea = (await repo.listIdeas(WS))[0];
  if (!idea) throw new Error("tohumda fikir yok");
  return repo.createStudioOrder(
    WS,
    {
      ideaId: idea.id,
      ticket: {
        siparis_id: "ornek-studyo-e2e-0", fikir_id: idea.id, plan_hafta: "2026-10-26", hesap: "ornek-studyo", mod: "senaryo", tur: "broll", sutun: "Deneme",
        istenen_saat: "2026-10-30 18:00", onay: false, durum: "taslak", senaryo: "Merhaba, bu bir deneme senaryosudur.",
      } as never,
      note: "Deneme",
      weekStart: "2026-10-26",
    },
    NOW,
  );
}

/** Sahte stüdyo: dosyayı okur, kapıdaki kuralı uygular (yalnız onaylı taslak), sonucu kendisi yazar. */
function fakeStudio(path: string, outcome: "uretildi" | "hata") {
  const ticket = readTicket(readFileSync(path, "utf8")).ticket;
  if (!ticket.onay || ticket.durum !== "taslak") throw new Error("stüdyo kapısı: yalnız onay: evet + taslak üretilir");
  const dir = join(dirname(path), ticket.siparis_id);
  if (outcome === "uretildi") {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "final.mp4"), "video");
    writeFileSync(join(dir, "kapak.jpg"), "kapak");
    writeFileSync(join(dir, "aciklama.txt"), "Açıklama metni #yapayzeka");
    writeFileSync(path, writeTicket({ ...ticket, durum: "uretildi", video: `${ticket.siparis_id}/final.mp4`, kapak: `${ticket.siparis_id}/kapak.jpg` }, "not"), "utf8");
  } else {
    writeFileSync(path, writeTicket({ ...ticket, durum: "hata", hata_notu: "Ses üretilemedi." }, "not"), "utf8");
  }
}

function storeOf(repo: PanelRepository) {
  const rows: CreatePublishJobInput[] = [];
  const store: OrderReturnStore = {
    hasJobForOrder: async () => rows.length > 0,
    findAccountId: async () => "acc-1",
    ideaCaption: async () => undefined,
    createJob: async (input) => void rows.push(input),
    notify: async () => true,
    async markPanelOrder(update) {
      const order = (await repo.listStudioOrders(WS)).find((o) => o.ticket.siparis_id === update.orderId);
      if (order === undefined) return;
      const patch = update.status === "uretildi" ? { status: "uretildi" as const, video: update.video, ...(update.cover !== undefined ? { cover: update.cover } : {}) } : { status: "hata" as const, errorNote: update.errorNote };
      await repo.advanceStudioOrder(WS, order.id, patch, NOW);
    },
  };
  return { rows, store };
}

describe("üretime gönder: uçtan uca (sahte stüdyo)", () => {
  it("gönder → stüdyo üretir → dönüş: yayın satırı awaiting_approval, panel fişi uretildi", async () => {
    const repo = createMockRepository();
    const root = mkdtempSync(join(tmpdir(), "spn33-e2e-"));
    dirs.push(root);
    const order = await newOrder(repo);
    const sent = await sendOrderToStudio({ repo, wsId: WS, orderId: order.id, panelSlug: "ornekstudyoapp", now: NOW, root });
    expect(readTicket(readFileSync(sent.path, "utf8")).ticket).toMatchObject({ onay: true, durum: "taslak" });
    fakeStudio(sent.path, "uretildi");
    const { rows, store } = storeOf(repo);
    const result = await returnOrders({ root, studioSlug: sent.studioSlug, now: NOW, store, onlyOrderId: sent.ticketId });
    expect(result.opened).toEqual([sent.ticketId]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "awaiting_approval" });
    const after = await repo.getStudioOrder(WS, order.id);
    expect(after?.status).toBe("uretildi");
  });

  it("stüdyo hata verirse panel fişi hata olur, yayın satırı açılmaz", async () => {
    const repo = createMockRepository();
    const root = mkdtempSync(join(tmpdir(), "spn33-e2e-"));
    dirs.push(root);
    const order = await newOrder(repo);
    const sent = await sendOrderToStudio({ repo, wsId: WS, orderId: order.id, panelSlug: "ornekstudyoapp", now: NOW, root });
    fakeStudio(sent.path, "hata");
    const { rows, store } = storeOf(repo);
    await returnOrders({ root, studioSlug: sent.studioSlug, now: NOW, store, onlyOrderId: sent.ticketId });
    expect(rows).toHaveLength(0);
    const after = await repo.getStudioOrder(WS, order.id);
    expect(after?.status).toBe("hata");
  });
});
