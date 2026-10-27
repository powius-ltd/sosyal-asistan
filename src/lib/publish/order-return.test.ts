import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CreatePublishJobInput } from "@/lib/data/queries";
import { ComplianceFailedError, RepositoryError } from "@/lib/data/repository";
import { handledOrderIds, isActiveOrderStatus, isHandledOrderStatus } from "@/lib/publish/order-rows";
import { returnOrders, type OrderReturnStore } from "@/lib/publish/order-return";

const NOW = new Date("2026-10-20T10:00:00Z");
let root: string;
let outside: string;

const ticketText = (over: Record<string, string> = {}) => {
  const f: Record<string, string> = {
    siparis_id: "s1", plan_hafta: "2026-10-19", hesap: "ornek-studyo", mod: "senaryo", sutun: "x", istenen_saat: "2026-10-22 21:00", onay: "evet", durum: "uretildi",
    senaryo: "Merhaba", video: "s1/final.mp4", ...over,
  };
  return `---\n${Object.entries(f).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\nnot\n`;
};

function addOrder(id = "s1", over: Record<string, string> = {}, caption: string | null = "Açıklama #yz") {
  const week = join(root, "ornek-studyo", "2026-10-19");
  mkdirSync(join(week, id), { recursive: true });
  writeFileSync(join(week, id, "final.mp4"), "video");
  if (caption !== null) writeFileSync(join(week, id, "aciklama.txt"), caption);
  writeFileSync(join(week, `${id}.md`), ticketText({ siparis_id: id, video: `${id}/final.mp4`, ...over }));
}

function fakeStore(opts: { complianceFails?: boolean } = {}) {
  const jobs: (Omit<CreatePublishJobInput, "status"> & { orderId: string; status: string; createdAt?: string })[] = [];
  let tick = 0;
  const notices: { dedupeKey: string; title: string; body: string }[] = [];
  const store: OrderReturnStore = {
    async hasJobForOrder(id) { return handledOrderIds(jobs.map((j) => ({ order_id: j.orderId, status: j.status, created_at: j.createdAt as string }))).has(id); },
    async findAccountId() { return "acc-1"; },
    async ideaCaption() { return undefined; },
    async createJob(input) {
      if (opts.complianceFails && input.status === "awaiting_approval") throw new ComplianceFailedError("YZ beyanı yok", { status: "fail", findings: [] } as never);
      if (jobs.some((j) => j.orderId === input.orderId && isActiveOrderStatus(j.status))) throw new RepositoryError("already_exists", "var");
      jobs.push({ ...(input as unknown as (typeof jobs)[number]), createdAt: new Date(Date.UTC(2026, 9, 20, 0, 0, tick++)).toISOString() });
    },
    async notify(d) {
      if (notices.some((n) => n.dedupeKey === d.dedupeKey)) return false;
      notices.push(d);
      return true;
    },
  };
  return { store, jobs, notices };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "siparis-"));
  outside = mkdtempSync(join(tmpdir(), "dis-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

const run = (store: OrderReturnStore) => returnOrders({ root, studioSlug: "ornek-studyo", now: NOW, store });

describe("order_return", () => {
  it("üretildi fişinden tek awaiting_approval satırı + tek bildirim açar, ikinci taramada açmaz", async () => {
    addOrder();
    const { store, jobs, notices } = fakeStore();
    const first = await run(store);
    expect(first.opened).toEqual(["s1"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: "awaiting_approval", orderId: "s1", mediaPath: "siparis:ornek-studyo/2026-10-19/s1/final.mp4", aiGenerated: true, scheduledFor: "2026-10-22T18:00:00.000Z" });
    expect(notices).toHaveLength(1);
    const second = await run(store);
    expect(second.opened).toEqual([]);
    expect(second.alreadyHandled).toBe(1);
    expect(jobs).toHaveLength(1);
    expect(notices).toHaveLength(1);
  });

  it("kullanıcının iptal ettiği sipariş ikinci taramada açılmaz; başarısız / süresi dolmuş yeniden açılır (Y6)", async () => {
    addOrder();
    const { store, jobs } = fakeStore();
    await run(store);
    expect(jobs).toHaveLength(1);
    expect((await run(store)).opened).toEqual([]); // etkin satır var
    jobs[0].status = "cancelled";
    const afterCancel = await run(store);
    expect(afterCancel.opened).toEqual([]);
    expect(afterCancel.alreadyHandled).toBe(1);
    expect(jobs).toHaveLength(1);
    jobs[0].status = "failed";
    expect((await run(store)).opened).toEqual(["s1"]);
    expect(jobs).toHaveLength(2);
    jobs[1].status = "expired";
    expect((await run(store)).opened).toEqual(["s1"]);
    expect(isHandledOrderStatus("cancelled")).toBe(true);
    expect(isHandledOrderStatus("failed")).toBe(false);
    expect(isHandledOrderStatus("expired")).toBe(false);
    // DB indeksi iptalliyi serbest bırakır ("değiştir" akışı yeni satır açabilsin diye); kalıcı ret yalnız dönüş taramasındadır.
    expect(isActiveOrderStatus("cancelled")).toBe(false);
    expect(isActiveOrderStatus("draft")).toBe(true);
  });

  it("N1: karar siparişin EN SON satırına göre (handledOrderIds)", () => {
    const row = (status: string, created_at: string, order_id: string | null = "s1") => ({ order_id, status, created_at });
    // (a) replace sonrası: eski satır cancelled, yeni satır failed -> yeniden açılır
    expect(handledOrderIds([row("cancelled", "2026-10-20T10:00:00Z"), row("failed", "2026-10-20T11:00:00Z")]).has("s1")).toBe(false);
    expect(handledOrderIds([row("failed", "2026-10-20T11:00:00Z"), row("cancelled", "2026-10-20T10:00:00Z")]).has("s1")).toBe(false);
    // (b) tek cancelled -> kalıcı ret
    expect(handledOrderIds([row("cancelled", "2026-10-20T10:00:00Z")]).has("s1")).toBe(true);
    // (c) failed sonra yeni approved -> açılmaz
    expect(handledOrderIds([row("failed", "2026-10-20T10:00:00Z"), row("approved", "2026-10-20T11:00:00Z")]).has("s1")).toBe(true);
    expect(handledOrderIds([row("expired", "2026-10-20T10:00:00Z")]).has("s1")).toBe(false);
    expect(handledOrderIds([row("approved", "2026-10-20T10:00:00Z", null)]).size).toBe(0);
  });

  it("N1: değiştir akışı (iptalli eski + düşen yeni satır) siparişi yeniden açar", async () => {
    addOrder();
    const { store, jobs } = fakeStore();
    await run(store);
    jobs[0].status = "cancelled";
    jobs.push({ ...jobs[0], status: "failed", createdAt: "2026-10-21T00:00:00.000Z" });
    expect((await run(store)).opened).toEqual(["s1"]);
  });

  it("uretildi olmayan ya da onaysız fişi almaz", async () => {
    addOrder("a", { durum: "uretiliyor" });
    addOrder("b", { onay: "hayir" });
    const { store, jobs } = fakeStore();
    expect((await run(store)).opened).toEqual([]);
    expect(jobs).toHaveLength(0);
  });

  it("uyum fail → draft + nedenini söyleyen bildirim", async () => {
    addOrder();
    const { store, jobs, notices } = fakeStore({ complianceFails: true });
    const r = await run(store);
    expect(r.drafts).toEqual(["s1"]);
    expect(jobs[0]?.status).toBe("draft");
    expect(notices[0]?.body).toContain("Yapay zekâ");
  });

  it("geçmiş saat: satır açılır, saat boş, bildirimde not var", async () => {
    addOrder("p", { istenen_saat: "2026-10-01 10:00" });
    const { store, jobs, notices } = fakeStore();
    await run(store);
    expect(jobs[0]?.scheduledFor).toBeUndefined();
    expect(notices[0]?.body).toContain("yeni bir saat seç");
  });

  it("açıklama yok → atlanır", async () => {
    addOrder("c", {}, null);
    const { store, jobs } = fakeStore();
    const r = await run(store);
    expect(r.skipped).toEqual([{ orderId: "c", reason: "caption_missing" }]);
    expect(jobs).toHaveLength(0);
  });

  it("video yolu kök dışına çıkamaz (../ ve sembolik bağ)", async () => {
    addOrder("up", { video: "../../../../etc/hosts" });
    addOrder("abs", { video: join(outside, "x.mp4") });
    writeFileSync(join(outside, "x.mp4"), "dis");
    addOrder("lnk");
    const week = join(root, "ornek-studyo", "2026-10-19");
    rmSync(join(week, "lnk", "final.mp4"));
    symlinkSync(join(outside, "x.mp4"), join(week, "lnk", "final.mp4"));
    const { store, jobs } = fakeStore();
    const r = await run(store);
    expect(jobs).toHaveLength(0);
    expect(r.skipped.map((s) => s.reason)).toEqual(["media_outside_root", "media_outside_root", "media_outside_root"]);
  });
});
