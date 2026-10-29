/** Fişi stüdyoya gönderme: dosya biçimi ve yolu, idempotans, reddedilen türler / kipler, panel durumu. Hep geçici klasörde; gerçek sipariş klasörüne dokunmaz. */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMockRepository } from "@/lib/data/mock/mock-repository";
import type { PanelRepository } from "@/lib/data/repository";
import { orderSendProblem, OrderSendError, sendOrderToStudio } from "@/lib/studio-order/send-to-studio";
import { readTicket } from "@/lib/studio-order/ticket-file";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const NOW = new Date("2026-10-28T09:00:00.000Z");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const tempRoot = () => {
  const dir = mkdtempSync(join(tmpdir(), "spn33-send-"));
  dirs.push(dir);
  return dir;
};

async function orderOf(repo: PanelRepository, extra: Record<string, unknown> = {}, ideaIndex = 0) {
  const idea = (await repo.listIdeas(WS))[ideaIndex];
  if (!idea) throw new Error("tohumda fikir yok");
  return repo.createStudioOrder(
    WS,
    {
      ideaId: idea.id,
      ticket: {
        siparis_id: `ornek-studyo-test-${ideaIndex}`, fikir_id: idea.id, plan_hafta: "2026-10-26", hesap: "ornek-studyo", mod: "senaryo", tur: "broll", sutun: "Deneme",
        istenen_saat: "2026-10-30 18:00", onay: false, durum: "taslak", senaryo: "Merhaba, bu bir deneme senaryosudur.", ...extra,
      } as never,
      note: "Deneme notu",
      weekStart: "2026-10-26",
    },
    NOW,
  );
}

describe("orderSendProblem", () => {
  const base = { status: "taslak", ticket: { tur: "broll", mod: "senaryo" } } as unknown as Parameters<typeof orderSendProblem>[0];
  const studio = { studioSlug: "ornek-studyo", mode: "senaryo" } as const;
  it("senaryo + broll + stüdyo hesabı gönderilebilir", () => expect(orderSendProblem(base, studio)).toBeUndefined());
  it("anlatım, ugc, konu kipi, tanımsız hesap ve taslak olmayan fiş reddedilir", () => {
    expect(orderSendProblem({ status: "taslak", ticket: { tur: "anlatim", mod: "senaryo" } } as never, studio)).toBe("kind_narration");
    expect(orderSendProblem({ status: "taslak", ticket: { tur: "ugc", mod: "senaryo" } } as never, studio)).toBe("kind_ugc");
    expect(orderSendProblem({ status: "taslak", ticket: { tur: "broll", mod: "konu" } } as never, studio)).toBe("mode_topic");
    expect(orderSendProblem(base, undefined)).toBe("no_studio_account");
    expect(orderSendProblem({ ...base, status: "uretildi" } as never, studio)).toBe("not_draft");
    expect(orderSendProblem({ ...base, status: "hata" } as never, studio)).toBe("not_draft");
  });
});

describe("sendOrderToStudio", () => {
  it("fişi <kök>/<stüdyo>/<hafta>/<id>.md olarak onay: evet ile yazar ve panel fişini uretiliyor yapar", async () => {
    const repo = createMockRepository();
    const root = tempRoot();
    const order = await orderOf(repo);
    const result = await sendOrderToStudio({ repo, wsId: WS, orderId: order.id, panelSlug: "ornekstudyoapp", now: NOW, root });
    expect(result).toMatchObject({ outcome: "written", ticketId: "ornek-studyo-test-0", studioSlug: "ornek-studyo", fileStatus: "taslak" });
    expect(result.path).toBe(join(root, "ornek-studyo", "2026-10-26", "ornek-studyo-test-0.md"));
    const written = readTicket(readFileSync(result.path, "utf8"));
    expect(written.ticket).toMatchObject({ onay: true, durum: "taslak", hesap: "ornek-studyo", mod: "senaryo" });
    expect(written.note).toBe("Deneme notu");
    expect(await repo.getStudioOrder(WS, order.id)).toMatchObject({ status: "uretiliyor", ticket: { onay: true, durum: "uretiliyor" } });
    expect(readdirSync(join(root, "ornek-studyo", "2026-10-26"))).toEqual(["ornek-studyo-test-0.md"]);
  });

  it("idempotent: dosya zaten varsa üstüne yazmaz, mevcut durumu söyler", async () => {
    const repo = createMockRepository();
    const root = tempRoot();
    const order = await orderOf(repo);
    const first = await sendOrderToStudio({ repo, wsId: WS, orderId: order.id, panelSlug: "ornekstudyoapp", now: NOW, root });
    const before = readFileSync(first.path, "utf8");
    const second = await sendOrderToStudio({ repo, wsId: WS, orderId: order.id, panelSlug: "ornekstudyoapp", now: NOW, root });
    expect(second).toMatchObject({ outcome: "exists", path: first.path, fileStatus: "taslak" });
    expect(readFileSync(first.path, "utf8")).toBe(before);
  });

  it("reddedilen fişte hiçbir dosya yazılmaz ve panel fişi değişmez", async () => {
    const repo = createMockRepository();
    const root = tempRoot();
    const narration = await orderOf(repo, { tur: "anlatim" });
    await expect(sendOrderToStudio({ repo, wsId: WS, orderId: narration.id, panelSlug: "ornekstudyoapp", now: NOW, root })).rejects.toMatchObject({ code: "kind_narration" });
    await expect(sendOrderToStudio({ repo, wsId: WS, orderId: narration.id, panelSlug: "ornek", now: NOW, root })).rejects.toBeInstanceOf(OrderSendError);
    await expect(sendOrderToStudio({ repo, wsId: WS, orderId: "yok", panelSlug: "ornekstudyoapp", now: NOW, root })).rejects.toMatchObject({ code: "order_missing" });
    expect(existsSync(join(root, "ornek-studyo"))).toBe(false);
    expect((await repo.getStudioOrder(WS, narration.id))?.status).toBe("taslak");
  });

  it("fişin hesabı çalışma alanının stüdyo hesabıyla uyuşmuyorsa yazmaz", async () => {
    const repo = createMockRepository();
    const root = tempRoot();
    const order = await orderOf(repo, { hesap: "baska-hesap" });
    await expect(sendOrderToStudio({ repo, wsId: WS, orderId: order.id, panelSlug: "ornekstudyoapp", now: NOW, root })).rejects.toMatchObject({ code: "slug_mismatch" });
    expect(existsSync(join(root, "ornek-studyo"))).toBe(false);
  });
});
