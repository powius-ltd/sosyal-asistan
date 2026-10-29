/**
 * Sözleşme parçası: fiş (stüdyo siparişi: `createStudioOrder`, `getStudioOrder`, `listStudioOrders`, `updateStudioOrder`). Test her seferinde
 * kendi (elle) fikrini açar ve işi bitince `dismissed` yapar; fiş silme yolu yoktur, fişler fikirle birlikte test çalışma alanında kalır
 * (çalışma alanı süit sonunda silinir). `taslak` dışı durumdaki fişi değiştirme (`invalid_state`) depo üzerinden kurulamaz (durumu stüdyo
 * ilerletir): kural SQL testinde (`studio_orders.sql`) ve burada yalnız geçersiz durumla yazımın reddiyle sınanır.
 */
import { expect, it } from "vitest";

import { expectCode, MISSING_ID, type ContractContext } from "@/lib/data/contract/support";
import { STUDIO_ORDER_NOTE_MAX } from "@/lib/data/studio-order-input";
import type { PanelRepository } from "@/lib/data/repository";

function ticketFor(ideaId: string, extra: Record<string, unknown> = {}) {
  return {
    siparis_id: `sozlesme-${ideaId.slice(0, 8)}`,
    fikir_id: ideaId,
    plan_hafta: "2026-10-26",
    hesap: "sozlesme-hesabi",
    mod: "konu",
    sutun: "Sözleşme",
    istenen_saat: "2026-10-28 18:00",
    onay: false,
    durum: "taslak",
    konu: "Sözleşme konusu",
    ana_hat: ["Açılış", "Gelişme"],
    ...extra,
  } as never;
}

async function freshIdea(r: PanelRepository, wsId: string, title: string): Promise<string> {
  return (await r.createManualIdea(wsId, { title, note: "Fiş sözleşmesi için." }, new Date())).id;
}

export function studioOrdersContract(ctx: ContractContext): void {
  const { wsId, create } = ctx;

  it("fiş: yazılır (taslak), okunur, listelenir; aynı fikre ikinci etkin fiş reddedilir; yalnız tür ve not değişir", async () => {
    const r = create();
    const now = new Date();
    const ideaId = await freshIdea(r, wsId, "Fiş sözleşme fikri");
    const otherId = await freshIdea(r, wsId, "Fiş sözleşme fikri 2");
    try {
      const order = await r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId), note: "  İlk not  ", weekStart: "2026-10-26", slot: 1 }, now);
      expect(order).toMatchObject({ workspaceId: wsId, ideaId, weekStart: "2026-10-26", slot: 1, note: "İlk not", status: "taslak" });
      expect(order.ticket).toMatchObject({ durum: "taslak", onay: false, mod: "konu", konu: "Sözleşme konusu", ana_hat: ["Açılış", "Gelişme"] });
      expect(order.ticket.tur).toBeUndefined();
      expect(Number.isNaN(Date.parse(order.createdAt))).toBe(false);

      expect(await r.getStudioOrder(wsId, order.id)).toMatchObject({ id: order.id, ideaId, status: "taslak" });
      expect(await r.getStudioOrder(wsId, MISSING_ID)).toBeUndefined();
      expect(await r.getStudioOrder(wsId, "bozuk-kimlik")).toBeUndefined();

      const bare = await r.createStudioOrder(wsId, { ideaId: otherId, ticket: ticketFor(otherId, { fikir_id: undefined }) }, now);
      expect(bare).toMatchObject({ note: "", status: "taslak" });
      expect(bare.weekStart).toBeUndefined();
      expect(bare.slot).toBeUndefined();

      expect((await r.listStudioOrders(wsId, { ideaIds: [ideaId] })).map((o) => o.id)).toEqual([order.id]);
      expect(await r.listStudioOrders(wsId, { ideaIds: [] })).toEqual([]);
      expect((await r.listStudioOrders(wsId, { weekStart: "2026-10-26" })).map((o) => o.id)).toContain(order.id);
      expect((await r.listStudioOrders(wsId, { ideaIds: [ideaId, otherId] })).map((o) => o.id).sort()).toEqual([order.id, bare.id].sort());
      expect((await r.listStudioOrders(wsId)).length).toBeGreaterThanOrEqual(2);

      await expectCode(r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId) }, now), "already_exists");

      const typed = await r.updateStudioOrder(wsId, order.id, { kind: "ugc" }, now);
      expect(typed.ticket.tur).toBe("ugc");
      expect(typed.note).toBe("İlk not");
      const noted = await r.updateStudioOrder(wsId, order.id, { note: "Yeni not" }, now);
      expect(noted).toMatchObject({ note: "Yeni not", status: "taslak" });
      expect(noted.ticket.tur).toBe("ugc");
      expect(noted.ticket.konu).toBe("Sözleşme konusu");
      expect((await r.getStudioOrder(wsId, order.id))?.ticket.tur).toBe("ugc");
    } finally {
      await r.updateIdeaStatus(wsId, ideaId, "dismissed");
      await r.updateIdeaStatus(wsId, otherId, "dismissed");
    }
  });

  it("fiş: geçersiz girdi, yabancı fikir, bilinmeyen kimlik ve çalışma alanı reddedilir", async () => {
    const r = create();
    const now = new Date();
    const ideaId = await freshIdea(r, wsId, "Fiş sözleşme fikri 3");
    try {
      await expectCode(r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId, { durum: "uretiliyor" }) }, now), "invalid_input");
      await expectCode(r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId, { onay: true }) }, now), "invalid_input");
      await expectCode(r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId, { fikir_id: "baska" }) }, now), "invalid_input");
      await expectCode(r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId, { tur: "podcast" }) }, now), "invalid_input");
      await expectCode(r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId), note: "x".repeat(STUDIO_ORDER_NOTE_MAX + 1) }, now), "invalid_input");
      await expectCode(r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId), weekStart: "26 Ekim" }, now), "invalid_input");
      await expectCode(r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId), slot: -1 }, now), "invalid_input");
      await expectCode(r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId), extra: 1 } as never, now), "invalid_input");
      await expectCode(r.createStudioOrder(wsId, { ideaId: MISSING_ID, ticket: ticketFor(MISSING_ID) }, now), "not_found");
      await expectCode(r.createStudioOrder(MISSING_ID, { ideaId, ticket: ticketFor(ideaId) }, now), "not_found");
      expect(await r.listStudioOrders(wsId, { ideaIds: [ideaId] })).toEqual([]);

      const order = await r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId) }, now);
      await expectCode(r.updateStudioOrder(wsId, order.id, {}, now), "invalid_input");
      await expectCode(r.updateStudioOrder(wsId, order.id, { kind: "podcast" } as never, now), "invalid_input");
      await expectCode(r.updateStudioOrder(wsId, order.id, { ticket: {} } as never, now), "invalid_input");
      await expectCode(r.updateStudioOrder(wsId, MISSING_ID, { kind: "ugc" }, now), "not_found");
      await expectCode(r.updateStudioOrder(MISSING_ID, order.id, { kind: "ugc" }, now), "not_found");
      expect((await r.getStudioOrder(wsId, order.id))?.ticket.tur).toBeUndefined();
      await expectCode(r.listStudioOrders(wsId, { weekStart: "bozuk" }), "invalid_input");
    } finally {
      await r.updateIdeaStatus(wsId, ideaId, "dismissed");
    }
  });

  it("fiş: durum ilerler (uretiliyor + onay, uretildi + video, hata + not); geçersiz geçiş ve girdi reddedilir", async () => {
    const r = create();
    const now = new Date();
    const ideaId = await freshIdea(r, wsId, "Fiş sözleşme fikri 4");
    const failedId = await freshIdea(r, wsId, "Fiş sözleşme fikri 5");
    try {
      const order = await r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId) }, now);
      await expectCode(r.advanceStudioOrder(wsId, order.id, { status: "uretildi" } as never, now), "invalid_input");
      await expectCode(r.advanceStudioOrder(wsId, order.id, { status: "hata" } as never, now), "invalid_input");
      await expectCode(r.advanceStudioOrder(wsId, order.id, { status: "paylasildi" } as never, now), "invalid_input");
      await expectCode(r.advanceStudioOrder(wsId, MISSING_ID, { status: "uretiliyor" }, now), "not_found");
      await expectCode(r.advanceStudioOrder(MISSING_ID, order.id, { status: "uretiliyor" }, now), "not_found");

      const sent = await r.advanceStudioOrder(wsId, order.id, { status: "uretiliyor" }, now);
      expect(sent).toMatchObject({ status: "uretiliyor" });
      expect(sent.ticket).toMatchObject({ durum: "uretiliyor", onay: true });
      expect((await r.advanceStudioOrder(wsId, order.id, { status: "uretiliyor" }, now)).status).toBe("uretiliyor");
      await expectCode(r.updateStudioOrder(wsId, order.id, { kind: "ugc" }, now), "invalid_state");

      const done = await r.advanceStudioOrder(wsId, order.id, { status: "uretildi", video: "x/final.mp4", cover: "x/kapak.jpg" }, now);
      expect(done.ticket).toMatchObject({ durum: "uretildi", onay: true, video: "x/final.mp4", kapak: "x/kapak.jpg" });
      await expectCode(r.advanceStudioOrder(wsId, order.id, { status: "uretiliyor" }, now), "invalid_state");

      const failed = await r.createStudioOrder(wsId, { ideaId: failedId, ticket: ticketFor(failedId) }, now);
      await r.advanceStudioOrder(wsId, failed.id, { status: "uretiliyor" }, now);
      const bad = await r.advanceStudioOrder(wsId, failed.id, { status: "hata", errorNote: "Ses üretilemedi." }, now);
      expect(bad.ticket).toMatchObject({ durum: "hata", hata_notu: "Ses üretilemedi." });
      await expectCode(r.advanceStudioOrder(wsId, failed.id, { status: "uretildi", video: "y.mp4" }, now), "invalid_state");
    } finally {
      await r.updateIdeaStatus(wsId, ideaId, "dismissed");
      await r.updateIdeaStatus(wsId, failedId, "dismissed");
    }
  });
}
