import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ZernioError } from "@/lib/zernio/client";
import { postStateOf } from "@/lib/zernio/schema";
import { PostOutcomeUnknownError, ProviderError, type PollOutcome, type PublishProvider, type ScheduleOutcome } from "@/lib/publish/provider";
import { createZernioProvider } from "@/lib/publish/zernio-provider";
import { publishVerdict } from "@/lib/job-runner/outcome-map-halka";
import { runPublish, writeBackTicket, type OrderPublishRow, type PublishStore } from "@/lib/publish/run-publish";
import { parseFrontmatter } from "@/lib/studio-order/frontmatter";

const NOW = new Date("2026-10-20T10:00:00Z");
let root: string;
let ticketPath: string;

const TICKET = `---
siparis_id: s1
fikir_id: mock
plan_hafta: 2026-10-19
hesap: ornek-studyo
mod: senaryo
sutun: x
istenen_saat: 2026-10-22 21:00
onay: evet
durum: uretildi
senaryo: Merhaba
video: s1/final.mp4
---
not
`;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pub-"));
  const week = join(root, "ornek-studyo", "2026-10-19");
  mkdirSync(join(week, "s1"), { recursive: true });
  writeFileSync(join(week, "s1", "final.mp4"), "video-bytes");
  ticketPath = join(week, "s1.md");
  writeFileSync(ticketPath, TICKET);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const row = (over: Partial<OrderPublishRow> = {}): OrderPublishRow => ({
  id: "j1", orderId: "s1", status: "approved", caption: "açıklama", mediaPath: "siparis:ornek-studyo/2026-10-19/s1/final.mp4",
  scheduledFor: "2026-10-22T18:00:00.000Z", approvedAt: "2026-10-20T09:00:00.000Z", accountHandle: "ornekstudyoapp", ...over,
});

function fakeStore(rows: OrderPublishRow[], claimOk = true) {
  const events: string[] = [];
  const store: PublishStore = {
    async listRows() { return rows; },
    async claim(id) { events.push(`claim:${id}`); return claimOk; },
    async markReady(id, postId) { events.push(`ready:${id}:${postId}`); },
    async savePostId(id, postId) { events.push(`save:${id}:${postId}`); },
    async markPublished(id, i) { events.push(`published:${id}:${i.permalink ?? ""}`); },
    async markFailed(id, code) { events.push(`failed:${id}:${code}`); },
    async notify() { events.push("notify"); return true; },
  };
  return { store, events };
}

function fakeProvider(schedule: ScheduleOutcome | Error = { kind: "scheduled", postId: "zp1" }, poll: PollOutcome = { kind: "scheduled" }) {
  const scheduleFn = vi.fn(async () => { if (schedule instanceof Error) throw schedule; return schedule; });
  const provider: PublishProvider = { schedule: scheduleFn, poll: vi.fn(async () => poll) };
  return { provider, scheduleFn };
}

const verdictOf = (result: Awaited<ReturnType<typeof runPublish>>) => publishVerdict({ outcome: "done", result });
const run = (store: PublishStore, provider: PublishProvider, extra: Partial<Parameters<typeof runPublish>[0]> = {}) => runPublish({ root, studioSlug: "ornek-studyo", now: NOW, store, provider, ...extra });

describe("publish", () => {
  it("approved → publishing → ready (tek schedule), sonraki tur ready → published + fiş geri yazımı", async () => {
    const { store, events } = fakeStore([row()]);
    const { provider, scheduleFn } = fakeProvider();
    const first = await run(store, provider);
    expect(first.scheduled).toEqual(["s1"]);
    expect(events).toEqual(["claim:j1", "ready:j1:zp1"]);
    expect(scheduleFn).toHaveBeenCalledTimes(1);

    const second = fakeStore([row({ status: "ready", containerId: "zp1" })]);
    const p2 = fakeProvider(undefined, { kind: "published", permalink: "https://www.instagram.com/reel/ABC/" });
    const r2 = await run(second.store, p2.provider);
    expect(r2.published).toEqual(["s1"]);
    expect(p2.scheduleFn).not.toHaveBeenCalled();
    expect(second.events).toEqual(["published:j1:https://www.instagram.com/reel/ABC/", "notify"]);
  });

  it("fiş geri yazımı yalnız durum / zernio_post_id / yayin_url alanlarını değiştirir", async () => {
    const before = parseFrontmatter(readFileSync(ticketPath, "utf8")).data;
    const { store } = fakeStore([row({ status: "ready", containerId: "zp1" })]);
    const { provider } = fakeProvider(undefined, { kind: "published", permalink: "https://www.instagram.com/reel/ABC/" });
    await run(store, provider);
    const after = parseFrontmatter(readFileSync(ticketPath, "utf8")).data;
    const changed = Object.keys({ ...before, ...after }).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).sort();
    expect(changed).toEqual(["durum", "yayin_url", "zernio_post_id"]);
    expect(after.durum).toBe("paylasildi");
    expect(after.zernio_post_id).toBe("zp1");
  });

  it("409: önceki gönderi izlenir, ikinci POST yok", async () => {
    const { store, events } = fakeStore([row()]);
    const { provider, scheduleFn } = fakeProvider({ kind: "duplicate", existingPostId: "zp0" });
    await run(store, provider);
    expect(events).toEqual(["claim:j1", "ready:j1:zp0"]);
    expect(scheduleFn).toHaveBeenCalledTimes(1);
  });

  it("409 ama gönderi kimliği yok → failed değil, publishing'te takılı (Y2a)", async () => {
    const { store, events } = fakeStore([row()]);
    const { provider, scheduleFn } = fakeProvider({ kind: "duplicate" });
    const r = await run(store, provider);
    expect(r.failed).toEqual([]);
    expect(r.unconfirmed).toEqual([{ orderId: "s1" }]);
    expect(events).toEqual(["claim:j1"]);
    expect(scheduleFn).toHaveBeenCalledTimes(1);
  });

  it("geçmiş / boş saat gönderilmez", async () => {
    for (const scheduledFor of ["2026-10-20T09:00:00.000Z", undefined]) {
      const { store, events } = fakeStore([row({ scheduledFor })]);
      const { provider, scheduleFn } = fakeProvider();
      const r = await run(store, provider);
      expect(r.failed).toEqual([{ orderId: "s1", code: "schedule_in_past" }]);
      expect(scheduleFn).not.toHaveBeenCalled();
      expect(events).toEqual(["failed:j1:schedule_in_past"]);
    }
  });

  it("24 saatten eski onay gönderilmez", async () => {
    const { store } = fakeStore([row({ approvedAt: "2026-10-18T09:00:00.000Z" })]);
    const { provider, scheduleFn } = fakeProvider();
    const r = await run(store, provider);
    expect(r.failed[0]?.code).toBe("approval_stale");
    expect(scheduleFn).not.toHaveBeenCalled();
  });

  it("onay kaydı olmayan satır gönderilmez", async () => {
    const { store } = fakeStore([row({ approvedAt: undefined })]);
    const { provider, scheduleFn } = fakeProvider();
    await run(store, provider);
    expect(scheduleFn).not.toHaveBeenCalled();
  });

  it("sahiplenilemezse (başka süreç aldı) gönderilmez", async () => {
    const { store } = fakeStore([row()], false);
    const { provider, scheduleFn } = fakeProvider();
    const r = await run(store, provider);
    expect(scheduleFn).not.toHaveBeenCalled();
    expect(r.scheduled).toEqual([]);
  });

  it("kimliği bilinmeyen eski takılı satır: ikinci gönderim yok, tek bildirim, iş düşmez (Y1)", async () => {
    const { store, events } = fakeStore([row({ status: "publishing" })]);
    const { provider, scheduleFn } = fakeProvider();
    const r = await run(store, provider);
    expect(r.stuck).toEqual([]);
    expect(r.manual).toEqual([{ orderId: "s1" }]);
    expect(scheduleFn).not.toHaveBeenCalled();
    expect(events).toEqual(["notify"]);
  });

  it("markReady bir kez düşer → kimlik satıra yazılır, sonraki tur satırı ready yapar, ikinci POST yok (Y1)", async () => {
    const rows = [row()];
    const { store, events } = fakeStore(rows);
    let fail = true;
    store.markReady = async (id, postId) => { if (fail) throw new Error("db kapalı"); events.push(`ready:${id}:${postId}`); };
    const { provider, scheduleFn } = fakeProvider({ kind: "scheduled", postId: "zp9" });
    const first = await run(store, provider);
    expect(first.stuck).toEqual(["s1"]);
    expect(events).toEqual(["claim:j1", "save:j1:zp9"]);

    fail = false;
    rows[0] = row({ status: "publishing", containerId: "zp9" });
    const second = await run(store, provider);
    expect(events).toEqual(["claim:j1", "save:j1:zp9", "ready:j1:zp9"]);
    expect(second.scheduled).toEqual(["s1"]);
    expect(second.stuck).toEqual([]);
    expect(scheduleFn).toHaveBeenCalledTimes(1);
  });

  it("önceki turdan takılı satır varken yeni satır gönderilir, yeni satır takılmadıkça iş düşmez (Y1)", async () => {
    const { store, events } = fakeStore([row({ id: "j0", orderId: "s0", status: "publishing" }), row()]);
    const { provider, scheduleFn } = fakeProvider();
    const r = await run(store, provider);
    expect(scheduleFn).toHaveBeenCalledTimes(1);
    expect(r.scheduled).toEqual(["s1"]);
    expect(r.stuck).toEqual([]);
    expect(verdictOf(r).final.status).toBe("succeeded");
    expect(events).toEqual(["notify", "claim:j1", "ready:j1:zp1"]);
  });

  it("sağlayıcı hatası → failed, yeniden deneme yok", async () => {
    const { store, events } = fakeStore([row()]);
    const { provider, scheduleFn } = fakeProvider(new Error("Zernio 500"));
    const r = await run(store, provider);
    expect(r.failed).toEqual([{ orderId: "s1", code: "provider_error" }]);
    expect(events).toEqual(["claim:j1", "failed:j1:provider_error"]);
    expect(scheduleFn).toHaveBeenCalledTimes(1);
  });

  it("presign / yükleme hatası (createPost öncesi) → failed", async () => {
    const { store, events } = fakeStore([row()]);
    const { provider } = fakeProvider(new Error("presign 500"));
    const r = await run(store, provider);
    expect(r.failed).toEqual([{ orderId: "s1", code: "provider_error" }]);
    expect(r.unconfirmed).toEqual([]);
    expect(events).toEqual(["claim:j1", "failed:j1:provider_error"]);
  });

  it("markReady fırlatır → satır publishing'te kalır (failed değil), postId sonuçta ve günlükte", async () => {
    const { store, events } = fakeStore([row()]);
    store.markReady = async () => { throw new Error("db kapalı"); };
    const lines: string[] = [];
    const { provider } = fakeProvider({ kind: "scheduled", postId: "zp9" });
    const r = await run(store, provider, { log: (l) => lines.push(l) });
    expect(events).toEqual(["claim:j1", "save:j1:zp9"]);
    expect(r.failed).toEqual([]);
    expect(r.stuck).toEqual(["s1"]);
    expect(r.unconfirmed).toEqual([{ orderId: "s1", postId: "zp9" }]);
    expect(lines.join("\n")).toContain("zp9");
  });

  it("createPost başladıktan sonra okunamayan yanıt → failed değil, publishing'te takılı", async () => {
    const { store, events } = fakeStore([row()]);
    const { provider } = fakeProvider(new PostOutcomeUnknownError("yanıt okunamadı"));
    const r = await run(store, provider);
    expect(events).toEqual(["claim:j1"]);
    expect(r.failed).toEqual([]);
    expect(r.unconfirmed).toEqual([{ orderId: "s1" }]);
    // Sonraki tur: takılı satıra dokunulmaz, ikinci gönderim yok.
    const again = fakeStore([row({ status: "publishing" })]);
    const p2 = fakeProvider();
    await run(again.store, p2.provider);
    expect(p2.scheduleFn).not.toHaveBeenCalled();
  });

  it("Zernio sağlayıcısı: createPost hatası PostOutcomeUnknownError olur; presign hatası olmaz", async () => {
    const base = { read: { listAccounts: async () => [{ _id: "a1", platform: "instagram", username: "ornekstudyoapp", isActive: true }] } } as never;
    const request = { caption: "x", file: { name: "v.mp4", bytes: new Uint8Array([1]) }, thumbOffsetMs: 0, scheduledAt: new Date("2026-10-22T18:00:00Z"), accountHandle: "ornekstudyoapp" };
    const ok = { presign: async () => ({ uploadUrl: "u", publicUrl: "p" }), upload: async () => undefined, getPost: async () => ({}) };
    const afterPost = createZernioProvider({ ...(base as object), publish: { ...ok, createPost: async () => { throw new Error("timeout"); } } } as never);
    await expect(afterPost.schedule(request)).rejects.toBeInstanceOf(PostOutcomeUnknownError);
    const beforePost = createZernioProvider({ ...(base as object), publish: { ...ok, presign: async () => { throw new Error("presign 500"); }, createPost: async () => ({ kind: "created", httpStatus: 201, state: { postId: "z" } }) } } as never);
    await expect(beforePost.schedule(request)).rejects.not.toBeInstanceOf(PostOutcomeUnknownError);
  });

  it("kök dışına çıkan medya yolu okunmaz", async () => {
    const { store } = fakeStore([row({ mediaPath: "siparis:../etc/hosts" })]);
    const { provider, scheduleFn } = fakeProvider();
    const r = await run(store, provider);
    expect(r.failed[0]?.code).toBe("media_unreadable");
    expect(scheduleFn).not.toHaveBeenCalled();
  });

  it("fiş geri yazımından önce içerik değiştiyse üzerine yazılmaz; yazım geçici dosya + rename (k2)", () => {
    const original = readFileSync(ticketPath, "utf8");
    let reads = 0;
    const calls: string[] = [];
    const changing = {
      read: (p: string) => (++reads >= 2 ? `${original}\nelle-eklenen: evet\n` : readFileSync(p, "utf8")),
      write: (p: string) => { calls.push(`write:${p}`); },
      rename: (a: string, b: string) => { calls.push(`rename:${a}->${b}`); },
    };
    expect(() => writeBackTicket(ticketPath, "zp1", undefined, changing)).toThrow(/değişti/);
    expect(calls).toEqual([]);
    expect(readFileSync(ticketPath, "utf8")).toBe(original);

    const stable = { read: (p: string) => readFileSync(p, "utf8"), write: (p: string, t: string) => { calls.push(`write:${p}`); writeFileSync(p, t); }, rename: (a: string, b: string) => { calls.push("rename"); writeFileSync(b, readFileSync(a, "utf8")); } };
    expect(writeBackTicket(ticketPath, "zp1", undefined, stable).written).toBe(true);
    expect(calls[0]).toMatch(/\.tmp$/);
    expect(calls[1]).toBe("rename");
  });

  it("Zernio sağlayıcısı: createPost 400 → ProviderError (failed), 503 ve ağ hatası → belirsiz (Y2b)", async () => {
    const base = { read: { listAccounts: async () => [{ _id: "a1", platform: "instagram", username: "ornekstudyoapp", isActive: true }] } };
    const request = { caption: "x", file: { name: "v.mp4", bytes: new Uint8Array([1]) }, thumbOffsetMs: 0, scheduledAt: new Date("2026-10-22T18:00:00Z"), accountHandle: "ornekstudyoapp" };
    const withCreate = (createPost: () => Promise<never>) => createZernioProvider({ ...base, publish: { presign: async () => ({ uploadUrl: "u", publicUrl: "p" }), upload: async () => undefined, getPost: async () => ({}), createPost } } as never);
    await expect(withCreate(async () => { throw new ZernioError("Zernio gönderisi oluşturulamadı (400)", 400); }).schedule(request)).rejects.toBeInstanceOf(ProviderError);
    await expect(withCreate(async () => { throw new ZernioError("Zernio gönderisi oluşturulamadı (503)", 503); }).schedule(request)).rejects.toBeInstanceOf(PostOutcomeUnknownError);
    await expect(withCreate(async () => { throw new Error("fetch failed"); }).schedule(request)).rejects.toBeInstanceOf(PostOutcomeUnknownError);

    const { store, events } = fakeStore([row()]);
    const { provider } = fakeProvider(new ProviderError("provider_error", "400"));
    const r = await run(store, provider);
    expect(r.failed).toEqual([{ orderId: "s1", code: "provider_error" }]);
    expect(events).toEqual(["claim:j1", "failed:j1:provider_error"]);
  });

  it("GET /posts fixture'ı: published + adres okunur; scheduled beklenir; bilinmeyen durum scheduled değil unknown, takılı sayılmaz (4)", async () => {
    const fixture = JSON.parse(readFileSync(join(process.cwd(), "fixtures/zernio/get-posts.json"), "utf8")) as unknown;
    const base = { read: { listAccounts: async () => [] } };
    const provider = createZernioProvider({ ...base, publish: { getPost: async (id: string) => ({ ...postStateOf(fixture, id), postId: id }) } } as never);
    await expect(provider.poll("post_pub_1")).resolves.toEqual({ kind: "published", permalink: "https://www.instagram.com/reel/EXAMPLE1/" });
    await expect(provider.poll("post_sched_2")).resolves.toEqual({ kind: "scheduled" });
    await expect(provider.poll("post_odd_3")).resolves.toEqual({ kind: "unknown", status: "quarantined" });

    // Üst düzey status de okunur (platforms yoksa).
    const topOnly = createZernioProvider({ ...base, publish: { getPost: async () => postStateOf({ posts: [{ _id: "x", status: "published" }] }, "x") } } as never);
    await expect(topOnly.poll("x")).resolves.toEqual({ kind: "published" });

    // unknown → ready satır beklemede kalır, başarısız / takılı sayılmaz.
    const { store, events } = fakeStore([row({ status: "ready", containerId: "post_odd_3" })]);
    const r = await run(store, provider);
    expect(r.waiting).toBe(1);
    expect(r.failed).toEqual([]);
    expect(r.stuck).toEqual([]);
    expect(events).toEqual([]);
  });

  it("N2: ready satırı saatinden 24 saat sonra hâlâ doğrulanamıyorsa tek 'elle kontrol' bildirimi; satır değişmez", async () => {
    const unknown: PollOutcome = { kind: "unknown", status: "quarantined" };
    // 23 saat: bildirim yok
    const young = fakeStore([row({ status: "ready", containerId: "z1", scheduledFor: "2026-10-19T11:00:00.000Z" })]);
    const r23 = await run(young.store, fakeProvider(undefined, unknown).provider);
    expect(r23.unverified).toEqual([]);
    expect(young.events).toEqual([]);
    // 25 saat: bir bildirim (unknown)
    const old = fakeStore([row({ status: "ready", containerId: "z1", scheduledFor: "2026-10-19T09:00:00.000Z" })]);
    const r25 = await run(old.store, fakeProvider(undefined, unknown).provider);
    expect(r25.unverified).toEqual([{ orderId: "s1" }]);
    expect(r25.waiting).toBe(1);
    expect(old.events).toEqual(["notify"]);
    // ikinci tur: bildirim yine istenir ama dedupe anahtarı aynı (tek kayıt)
    const keys: string[] = [];
    const deduped: PublishStore = { ...old.store, async notify(d) { if (keys.includes(d.dedupeKey)) return false; keys.push(d.dedupeKey); return true; } };
    await run(deduped, fakeProvider(undefined, unknown).provider);
    await run(deduped, fakeProvider(undefined, unknown).provider);
    expect(keys).toEqual(["order_unverified:s1"]);
    // yoklama hatası (404 / ağ) aynı kural
    const failing: PublishProvider = { schedule: vi.fn(), poll: vi.fn(async () => { throw new Error("404"); }) };
    const errored = fakeStore([row({ status: "ready", containerId: "z1", scheduledFor: "2026-10-19T09:00:00.000Z" })]);
    const rErr = await run(errored.store, failing);
    expect(rErr.unverified).toEqual([{ orderId: "s1" }]);
    expect(errored.events).toEqual(["notify"]);
    // beklenen (scheduled) durum bildirim üretmez
    const waiting = fakeStore([row({ status: "ready", containerId: "z1", scheduledFor: "2026-10-19T09:00:00.000Z" })]);
    expect((await run(waiting.store, fakeProvider().provider)).unverified).toEqual([]);
  });
});
