/**
 * Video revizesi uçtan uca (mock depo + geçici sipariş klasörü, SPN-36): kapı `-r2` dosyasını yazar ve `-r1`'e dokunmaz; dönüş yalnız güncel
 * sürümün videosunu yayın onayına açar, eski sürüm dönerse atlar; sürüm kimliği saf işlevleri. Gerçek stüdyo / sipariş klasörü yok.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMockRepository } from "@/lib/data/mock/mock-repository";
import type { CreatePublishJobInput } from "@/lib/data/queries";
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import { handledOrderIds, isActiveOrderStatus } from "@/lib/publish/order-rows";
import { returnOrders, type OrderReturnStore } from "@/lib/publish/order-return";
import { baseOrderIdOf, isSupersededOrderId, orderVersionIds, revisionOrderId } from "@/lib/studio-order/revision-id";
import { sendOrderToStudio } from "@/lib/studio-order/send-to-studio";
import { readTicket } from "@/lib/studio-order/ticket-file";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const NOW = new Date("2026-10-28T09:00:00.000Z");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const tempRoot = () => {
  const dir = mkdtempSync(join(tmpdir(), "spn36-"));
  dirs.push(dir);
  return dir;
};
const WEEK_DIR = (root: string) => join(root, "ornek-studyo", "2026-10-26");

async function newOrder(repo: PanelRepository) {
  const idea = (await repo.listIdeas(WS))[0];
  if (!idea) throw new Error("tohumda fikir yok");
  return repo.createStudioOrder(
    WS,
    {
      ideaId: idea.id,
      ticket: { siparis_id: "ornek-studyo-2026-10-26-f1", fikir_id: idea.id, plan_hafta: "2026-10-26", hesap: "ornek-studyo", mod: "senaryo", tur: "broll", sutun: "Deneme", istenen_saat: "2026-10-30 18:00", onay: false, durum: "taslak", senaryo: "Merhaba, bu bir deneme senaryosudur." } as never,
      note: "Deneme notu",
      weekStart: "2026-10-26",
    },
    NOW,
  );
}

/** Stüdyo videoyu üretti: dosya + açıklama diske yazılır, fiş dosyası `uretildi` olur (dönüş bunu tarar). */
function studioFinishes(root: string, id: string, extra = ""): void {
  const dir = WEEK_DIR(root);
  mkdirSync(join(dir, id), { recursive: true });
  writeFileSync(join(dir, id, "final.mp4"), "video");
  writeFileSync(join(dir, id, "aciklama.txt"), "Açıklama");
  const text = readFileSync(join(dir, `${id}.md`), "utf8");
  writeFileSync(join(dir, `${id}.md`), text.replace("durum: taslak", `durum: uretildi\nvideo: ${id}/final.mp4${extra}`));
}

function fakeStore(repo: PanelRepository) {
  const jobs: (CreatePublishJobInput & { orderId: string; status: string; createdAt: string })[] = [];
  let tick = 0;
  const store: OrderReturnStore = {
    async hasJobForOrder(id) { return handledOrderIds(jobs.map((j) => ({ order_id: j.orderId, status: j.status, created_at: j.createdAt }))).has(id); },
    async isSupersededOrder(id) { return (await repo.listStudioOrders(WS)).some((o) => isSupersededOrderId(o, id)); },
    async findAccountId() { return "acc-1"; },
    async ideaCaption() { return undefined; },
    async createJob(input) {
      if (jobs.some((j) => j.orderId === input.orderId && isActiveOrderStatus(j.status))) throw new RepositoryError("already_exists", "var");
      jobs.push({ ...(input as object), createdAt: new Date(Date.UTC(2026, 9, 28, 0, 0, tick++)).toISOString() } as (typeof jobs)[number]);
    },
    async notify() { return true; },
    async markPanelOrder(update) {
      const order = (await repo.listStudioOrders(WS)).find((o) => o.ticket.siparis_id === update.orderId);
      if (order === undefined) return;
      if (update.status === "uretildi") await repo.advanceStudioOrder(WS, order.id, { status: "uretildi", video: update.video }, NOW);
    },
  };
  return { store, jobs };
}

describe("sürüm kimliği (saf)", () => {
  it("1. sürüm tabanın kendisi, sonrası -r<n> ekli", () => {
    expect(revisionOrderId("a-1", 1)).toBe("a-1");
    expect(revisionOrderId("a-1", 2)).toBe("a-1-r2");
    expect(revisionOrderId("a-1", 4)).toBe("a-1-r4");
  });
  it("taban ve eski sürümler geçmişten okunur, kimlik metninden değil (taban zaten -r2 ile bitebilir)", () => {
    const order = { revision: 2, ticket: { siparis_id: "slot-r2-r2" }, revisions: [{ version: 1, orderId: "slot-r2", requestedAt: "x", note: "n", publishJobId: "j" }] } as never;
    expect(baseOrderIdOf(order)).toBe("slot-r2");
    expect(orderVersionIds(order)).toEqual(["slot-r2", "slot-r2-r2"]);
    expect(isSupersededOrderId(order, "slot-r2")).toBe(true);
    expect(isSupersededOrderId(order, "slot-r2-r2")).toBe(false);
    expect(isSupersededOrderId(order, "baska")).toBe(false);
  });
});

describe("revize: kapı + dönüş", () => {
  it("kapı -r2 dosyasını revize notuyla yazar, -r1 dosyasına dokunmaz; dönüş yalnız güncel sürümü onaya açar, eskiyi atlar", async () => {
    const repo = createMockRepository();
    const root = tempRoot();
    const order = await newOrder(repo);
    const first = await sendOrderToStudio({ repo, wsId: WS, orderId: order.id, panelSlug: "ornekstudyoapp", now: NOW, root });
    expect(first).toMatchObject({ outcome: "written", ticketId: "ornek-studyo-2026-10-26-f1" });
    studioFinishes(root, "ornek-studyo-2026-10-26-f1");
    const v1Text = readFileSync(first.path, "utf8");

    // Dönüş 1: v1 onaya düşer.
    const { store, jobs } = fakeStore(repo);
    const r1 = await returnOrders({ root, studioSlug: "ornek-studyo", now: NOW, store });
    expect(r1.opened).toEqual(["ornek-studyo-2026-10-26-f1"]);
    // Panel fişi uretildi; v1'in yayın satırı mock depoda (iptal kuralı depo testinde); burada depodaki satırı kurup revize isteriz.
    const produced = await repo.getStudioOrder(WS, order.id);
    expect(produced?.status).toBe("uretildi");
    const account = (await repo.listOwnAccounts(WS))[0];
    await repo.createPublishJob(WS, { socialAccountId: account.id, caption: "Açıklama", orderId: "ornek-studyo-2026-10-26-f1", status: "awaiting_approval" });

    const revised = await repo.requestOrderRevision(WS, order.id, "Açılış daha kısa olsun", NOW);
    expect(revised).toMatchObject({ status: "taslak", revision: 2, ticket: { siparis_id: "ornek-studyo-2026-10-26-f1-r2", revize_notu: "Açılış daha kısa olsun", onceki_video: "ornek-studyo-2026-10-26-f1/final.mp4" } });

    // Kapı: -r2 dosyası yazılır, -r1 AYNEN kalır.
    const second = await sendOrderToStudio({ repo, wsId: WS, orderId: order.id, panelSlug: "ornekstudyoapp", now: NOW, root });
    expect(second).toMatchObject({ outcome: "written", ticketId: "ornek-studyo-2026-10-26-f1-r2", path: join(WEEK_DIR(root), "ornek-studyo-2026-10-26-f1-r2.md") });
    expect(readFileSync(first.path, "utf8")).toBe(v1Text);
    expect(readdirSync(WEEK_DIR(root)).filter((n) => n.endsWith(".md")).sort()).toEqual(["ornek-studyo-2026-10-26-f1-r2.md", "ornek-studyo-2026-10-26-f1.md"]);
    const written = readTicket(readFileSync(second.path, "utf8"));
    expect(written.ticket).toMatchObject({ siparis_id: "ornek-studyo-2026-10-26-f1-r2", onay: true, durum: "taslak", revize_notu: "Açılış daha kısa olsun", onceki_video: "ornek-studyo-2026-10-26-f1/final.mp4" });
    expect(written.ticket.video).toBeUndefined();
    // İdempotans sürüm başına sürer.
    expect(await sendOrderToStudio({ repo, wsId: WS, orderId: order.id, panelSlug: "ornekstudyoapp", now: NOW, root })).toMatchObject({ outcome: "exists", ticketId: "ornek-studyo-2026-10-26-f1-r2" });

    // Dönüş 2: v1 dosyası hâlâ uretildi ama ESKİ sürüm → atlanır; v2 bitince yalnız v2 açılır.
    const before = jobs.length;
    const skipped = await returnOrders({ root, studioSlug: "ornek-studyo", now: NOW, store });
    expect(skipped.opened).toEqual([]);
    expect(jobs.length).toBe(before);
    studioFinishes(root, "ornek-studyo-2026-10-26-f1-r2");
    const r2 = await returnOrders({ root, studioSlug: "ornek-studyo", now: NOW, store });
    expect(r2.opened).toEqual(["ornek-studyo-2026-10-26-f1-r2"]);
    expect(jobs.map((j) => j.orderId)).toEqual(["ornek-studyo-2026-10-26-f1", "ornek-studyo-2026-10-26-f1-r2"]);
    expect(await repo.getStudioOrder(WS, order.id)).toMatchObject({ status: "uretildi", revision: 2 });
  });

  it("eski sürümün (v1) dosyası revizeden sonra tek başına dönse de yayın satırı açılmaz", async () => {
    const repo = createMockRepository();
    const root = tempRoot();
    const order = await newOrder(repo);
    await sendOrderToStudio({ repo, wsId: WS, orderId: order.id, panelSlug: "ornekstudyoapp", now: NOW, root });
    studioFinishes(root, "ornek-studyo-2026-10-26-f1");
    const { store, jobs } = fakeStore(repo);
    // v1 hiç dönmeden panel fişini uretildi + yayın satırı ile revizeye sokmak mümkün değildir; eski sürüm "yarışı": revize sonrası dosya döner.
    await repo.advanceStudioOrder(WS, order.id, { status: "uretildi", video: "ornek-studyo-2026-10-26-f1/final.mp4" }, NOW);
    const account = (await repo.listOwnAccounts(WS))[0];
    await repo.createPublishJob(WS, { socialAccountId: account.id, caption: "Açıklama", orderId: "ornek-studyo-2026-10-26-f1", status: "awaiting_approval" });
    await repo.requestOrderRevision(WS, order.id, "Bir not", NOW);
    const result = await returnOrders({ root, studioSlug: "ornek-studyo", now: NOW, store });
    expect(result).toMatchObject({ opened: [], drafts: [], alreadyHandled: 1 });
    expect(jobs).toEqual([]);
  });
});
