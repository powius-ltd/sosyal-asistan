import { describe, expect, it } from "vitest";

import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { linkPublishedOrder, markTicketPublished, planOrderPublish, type PublishFs } from "@/lib/studio-order/publish";
import type { Ticket } from "@/lib/studio-order/schema";
import { readTicket, writeTicket } from "@/lib/studio-order/ticket-file";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const TICKET: Ticket = {
  siparis_id: "ornek-studyo-2026-10-26-s1",
  fikir_id: "mock",
  plan_hafta: "2026-10-26",
  slot: "S1",
  hesap: "ornek-studyo",
  mod: "senaryo",
  sutun: "teknik",
  istenen_saat: "2026-10-27 17:00",
  onay: true,
  durum: "uretildi",
  cta: "SEMİNER",
  senaryo: "Patron: tamam.",
  video: "ornek-studyo-2026-10-26-s1/final.mp4",
};
const PATH = "/siparis/ornek-studyo/2026-10-26/ornek-studyo-2026-10-26-s1.md";
const fsOf = (files: Record<string, string>): PublishFs => ({ exists: (p) => p in files, read: (p) => files[p] });
const VIDEO = "/siparis/ornek-studyo/2026-10-26/ornek-studyo-2026-10-26-s1/final.mp4";
const CAPTION = "/siparis/ornek-studyo/2026-10-26/ornek-studyo-2026-10-26-s1/aciklama.txt";

describe("planOrderPublish", () => {
  it("hazır fiş: video fişin yanından, açıklama stüdyonun aciklama.txt'sinden, saat fişten; engel yok", () => {
    const plan = planOrderPublish({ ticketPath: PATH, ticketText: writeTicket(TICKET, ""), fs: fsOf({ [VIDEO]: "", [CAPTION]: "Yorumlara SEMİNER yaz. #ai\n" }), ideaCaption: "fikir taslağı" });
    expect(plan).toMatchObject({ videoPath: VIDEO, caption: "Yorumlara SEMİNER yaz. #ai", captionSource: "aciklama.txt", scheduleStamp: "2026-10-27 17:00", blockers: [], warnings: [] });
  });

  it("aciklama.txt yoksa fikrin açıklama taslağına düşer; CTA kelimesi geçmiyorsa uyarır (engellemez)", () => {
    const plan = planOrderPublish({ ticketPath: PATH, ticketText: writeTicket(TICKET, ""), fs: fsOf({ [VIDEO]: "" }), ideaCaption: "Taslak açıklama #ai" });
    expect(plan.captionSource).toBe("fikir");
    expect(plan.blockers).toEqual([]);
    expect(plan.warnings[0]).toContain("SEMİNER");
  });

  it("taslak durumlu, videosuz, onaysız, açıklamasız mock fiş: hepsi engel olarak sayılır (dry-run bunları yazar)", () => {
    const mock: Ticket = { ...TICKET, durum: "taslak", onay: false, video: undefined };
    const plan = planOrderPublish({ ticketPath: PATH, ticketText: writeTicket(mock, ""), fs: fsOf({}) });
    expect(plan.blockers).toHaveLength(4);
    expect(plan.blockers.join(" | ")).toMatch(/taslak.*uretildi|video yok|onay: hayir|açıklama yok/);
    expect(plan.videoPath).toBeUndefined();
  });

  it("zaten paylaşılmış fiş ikinci kez gönderilmez; video dosyası yoksa engel", () => {
    const done = planOrderPublish({ ticketPath: PATH, ticketText: writeTicket({ ...TICKET, zernio_post_id: "p1" }, ""), fs: fsOf({ [VIDEO]: "", [CAPTION]: "x SEMİNER" }) });
    expect(done.blockers.some((b) => b.includes("zaten paylaşılmış"))).toBe(true);
    const missing = planOrderPublish({ ticketPath: PATH, ticketText: writeTicket(TICKET, ""), fs: fsOf({ [CAPTION]: "x SEMİNER" }) });
    expect(missing.blockers.some((b) => b.includes("video dosyası yok"))).toBe(true);
  });
});

describe("paylaşım sonrası fiş ve bağ", () => {
  it("paylasildi + zernio_post_id + yayin_url yazılır; stüdyo alanları ve not korunur", () => {
    const text = writeTicket(TICKET, "Not");
    const next = readTicket(markTicketPublished(text, "post-1", "https://www.instagram.com/reel/AbCdEfGhIjK/"));
    expect(next.ticket).toMatchObject({ durum: "paylasildi", zernio_post_id: "post-1", yayin_url: "https://www.instagram.com/reel/AbCdEfGhIjK/", video: TICKET.video, senaryo: TICKET.senaryo });
    expect(next.note).toBe("Not");
    expect(readTicket(markTicketPublished(text, "post-2", undefined)).ticket.yayin_url).toBeUndefined();
  });

  it("fikri yayın adresindeki Reels'e bağlar (mock depo; kısa kod platform modülünden)", async () => {
    const repo = createMockRepository();
    const idea = (await repo.listIdeas(WS))[0];
    const outcome = await linkPublishedOrder(repo, WS, { ...TICKET, fikir_id: idea.id }, "https://www.instagram.com/reel/abcdefghijk/");
    expect(outcome.kind).toBe("linked");
    if (outcome.kind === "linked") expect(outcome.link).toMatchObject({ ideaId: idea.id, shortcode: "abcdefghijk", origin: "manual_url" });
    // aynı bağ ikinci kez: idempotent
    const again = await linkPublishedOrder(repo, WS, { ...TICKET, fikir_id: idea.id }, "https://www.instagram.com/reel/abcdefghijk/");
    expect(again.kind).toBe("linked");
    expect((await repo.listIdeaLinks(WS, { ideaId: idea.id })).filter((l) => l.status !== "rejected")).toHaveLength(1);
  });

  it("elle/mock fişte ya da yayın adresi yokken bağ kurulmaz ve sebebi söylenir", async () => {
    const repo = createMockRepository();
    expect(await linkPublishedOrder(repo, WS, TICKET, "https://www.instagram.com/reel/abcdefghijk/")).toMatchObject({ kind: "skipped" });
    const idea = (await repo.listIdeas(WS))[0];
    const noUrl = await linkPublishedOrder(repo, WS, { ...TICKET, fikir_id: idea.id }, undefined);
    expect(noUrl).toMatchObject({ kind: "skipped" });
    expect(await repo.listIdeaLinks(WS, { ideaId: idea.id })).toHaveLength(0);
  });
});
