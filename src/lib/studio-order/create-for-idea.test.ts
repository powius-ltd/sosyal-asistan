/** Fikirden fiş üretimi (mock depo): yeni fiş, tekrar çağrıda aynı fiş, tür (ugc), tanımsız hesap, yabancı fikir, güncelleme. */
import { describe, expect, it } from "vitest";

import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { RepositoryError } from "@/lib/data/repository";
import { createOrderForIdea, refreshDraftOrder, updateOrder } from "@/lib/studio-order/create-for-idea";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const NOW = new Date("2026-09-30T09:00:00.000Z");

async function setup() {
  const repo = createMockRepository();
  const ideas = await repo.listIdeas(WS);
  const idea = ideas.find((i) => i.scriptOutline.length > 0 || i.hooks.length > 0);
  if (!idea) throw new Error("tohumda fiş kurulabilir fikir yok");
  return { repo, idea };
}

describe("createOrderForIdea", () => {
  it("yeni taslak fiş yazar; ikinci çağrı aynı fişi döndürür", async () => {
    const { repo, idea } = await setup();
    const first = await createOrderForIdea({ repo, wsId: WS, now: NOW, ideaId: idea.id, panelSlug: "ornek-marka" });
    expect(first.created).toBe(true);
    expect(first.order).toMatchObject({ ideaId: idea.id, status: "taslak" });
    expect(first.order.ticket).toMatchObject({ hesap: "ornek-marka", mod: "konu", onay: false, durum: "taslak", fikir_id: idea.id });

    const second = await createOrderForIdea({ repo, wsId: WS, now: NOW, ideaId: idea.id, panelSlug: "ornek-marka" });
    expect(second.created).toBe(false);
    expect(second.order.id).toBe(first.order.id);
    expect(await repo.listStudioOrders(WS, { ideaIds: [idea.id] })).toHaveLength(1);
  });

  it("fiş istemek seçmektir: yeni (new) fikir fiş yazılınca saved olur; zaten seçilmişe dokunulmaz", async () => {
    const repo = createMockRepository();
    const ideas = await repo.listIdeas(WS);
    const fresh = ideas.find((i) => i.status === "new" && (i.scriptOutline.length > 0 || i.hooks.length > 0));
    if (!fresh) throw new Error("tohumda yeni fikir yok");
    await createOrderForIdea({ repo, wsId: WS, now: NOW, ideaId: fresh.id, panelSlug: "ornek" });
    expect((await repo.getIdea(WS, fresh.id))?.status).toBe("saved");
    const again = await createOrderForIdea({ repo, wsId: WS, now: NOW, ideaId: fresh.id, panelSlug: "ornek" });
    expect(again.created).toBe(false);
    expect((await repo.getIdea(WS, fresh.id))?.status).toBe("saved");
  });

  it("ugc türü ve not fişe yazılır", async () => {
    const { repo, idea } = await setup();
    const { order } = await createOrderForIdea({ repo, wsId: WS, now: NOW, ideaId: idea.id, panelSlug: "ornek-marka", kind: "ugc", note: "Sabah çekilsin." });
    expect(order.ticket.tur).toBe("ugc");
    expect(order.note).toContain("Sabah çekilsin.");
  });

  it("stüdyoda tanımsız hesapta (ornek) hata atmadan kendi kimliğiyle yazar", async () => {
    const { repo, idea } = await setup();
    const { order } = await createOrderForIdea({ repo, wsId: WS, now: NOW, ideaId: idea.id, panelSlug: "ornek" });
    expect(order.ticket.hesap).toBe("ornek");
    expect(order.ticket.siparis_id.startsWith("ornek-")).toBe(true);
    expect(["senaryo", "konu"]).toContain(order.ticket.mod);
  });

  it("yabancı fikirde not_found", async () => {
    const { repo } = await setup();
    await expect(createOrderForIdea({ repo, wsId: WS, now: NOW, ideaId: "00000000-0000-4000-8000-00000000dead", panelSlug: "ornek" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("updateOrder", () => {
  it("taslak fişin türünü ve notunu değiştirir; hiç alan yoksa invalid_input", async () => {
    const { repo, idea } = await setup();
    const { order } = await createOrderForIdea({ repo, wsId: WS, now: NOW, ideaId: idea.id, panelSlug: "ornek-marka" });
    const updated = await updateOrder({ repo, wsId: WS, now: NOW, orderId: order.id, kind: "ugc", note: "Yeni not" });
    expect(updated.ticket.tur).toBe("ugc");
    expect(updated.note).toBe("Yeni not");
    await expect(updateOrder({ repo, wsId: WS, now: NOW, orderId: order.id })).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe("refreshDraftOrder (SPN-35 G6)", () => {
  it("fikir metni değişince taslak fiş yeni metinle kurulur; kimlik, tür ve not korunur", async () => {
    const { repo, idea } = await setup();
    const { order } = await createOrderForIdea({ repo, wsId: WS, now: NOW, ideaId: idea.id, panelSlug: "ornek-marka", kind: "ugc", note: "Sabah çekilsin." });
    await repo.reviseIdea(WS, idea.id, { request: "açılışı değiştir", hooks: [{ text: "Yepyeni bir açılış cümlesi burada.", type: "question" }, { text: "İkinci yeni açılış.", type: "bold_claim" }, { text: "Üçüncü yeni açılış.", type: "confession" }], scriptOutline: ["Yeni madde bir", "Yeni madde iki"] }, NOW);
    const refreshed = await refreshDraftOrder({ repo, wsId: WS, now: NOW, ideaId: idea.id });
    expect(refreshed?.id).toBe(order.id);
    expect(refreshed?.ticket).toMatchObject({ siparis_id: order.ticket.siparis_id, hesap: order.ticket.hesap, tur: "ugc", durum: "taslak", onay: false });
    expect(JSON.stringify(refreshed?.ticket)).toContain("Yepyeni bir açılış cümlesi burada.");
    expect(refreshed?.note).toBe(order.note);
  });

  it("taslak olmayan (üretime gitmiş) fişe ve fişsiz fikre dokunmaz", async () => {
    const { repo, idea } = await setup();
    expect(await refreshDraftOrder({ repo, wsId: WS, now: NOW, ideaId: idea.id })).toBeUndefined();
    const { order } = await createOrderForIdea({ repo, wsId: WS, now: NOW, ideaId: idea.id, panelSlug: "ornek-marka" });
    const sent = await repo.advanceStudioOrder(WS, order.id, { status: "uretiliyor" }, NOW);
    await repo.reviseIdea(WS, idea.id, { request: "değiştir", hooks: [{ text: "Bir.", type: "question" }, { text: "İki.", type: "question" }, { text: "Üç.", type: "question" }], scriptOutline: ["a madde", "b madde"] }, NOW).catch(() => undefined);
    expect(await refreshDraftOrder({ repo, wsId: WS, now: NOW, ideaId: idea.id })).toBeUndefined();
    expect((await repo.getStudioOrder(WS, order.id))?.ticket).toEqual(sent.ticket);
  });
});
