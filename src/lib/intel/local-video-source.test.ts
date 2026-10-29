/** Yerel video eşlemesi: permalink → kısa kod → içerik; dosya yok, `siparis:` öneki yok, rakip içerik asla yerelden gelmez. DB/disk SAHTE. */
import { describe, expect, it, vi } from "vitest";

import { matchLocalVideos, resolveLocalVideos, type LocalContentRef, type PublishedOrderRow } from "@/lib/intel/local-video-source";
import { OrderMediaError } from "@/lib/publish/order-media";
import type { AdminClient } from "@/lib/supabase/admin";

const own = (id: string, shortcode: string, externalId = `ext-${id}`): LocalContentRef => ({ id, platform: "instagram", shortcode, externalId, isOwn: true });
const rival = (id: string, shortcode: string): LocalContentRef => ({ id, platform: "instagram", shortcode, externalId: `ext-${id}`, isOwn: false });
const job = (extra: Partial<PublishedOrderRow> = {}): PublishedOrderRow => ({
  platform: "instagram",
  mediaPath: "siparis:hesap/2026-10-26/abc/final.mp4",
  permalink: "https://www.instagram.com/reel/DdJy8QANttn/",
  ...extra,
});
const found = (mediaPath: string) => `/disk/${mediaPath.slice("siparis:".length)}`;

describe("matchLocalVideos", () => {
  it("permalink'ten kısa kodu çıkarıp kendi içeriğe eşler", () => {
    const out = matchLocalVideos([own("c1", "DdJy8QANttn"), own("c2", "baska")], [job()], found);
    expect([...out.files]).toEqual([["c1", "/disk/hesap/2026-10-26/abc/final.mp4"]]);
    expect(out.notes).toEqual([]);
  });

  it("kısa kod tutmazsa yayın kimliği içerik external_id'sine birebir eşitse eşler", () => {
    const out = matchLocalVideos([own("c1", "x", "17900")], [job({ permalink: undefined, externalId: "17900" })], found);
    expect(out.files.get("c1")).toBeDefined();
  });

  it("rakip içerik asla yerelden gelmez (kod aynı olsa bile)", () => {
    const out = matchLocalVideos([rival("r1", "DdJy8QANttn")], [job()], found);
    expect(out.files.size).toBe(0);
  });

  it("siparis: öneki olmayan iş atlanır (resolveFile çağrılmaz)", () => {
    const resolve = vi.fn(found);
    const out = matchLocalVideos([own("c1", "DdJy8QANttn")], [job({ mediaPath: "publish-media/x.mp4" })], resolve);
    expect(out.files.size).toBe(0);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("dosya yoksa atlanır ve not düşer; geçersiz yolda da içerik yerelden gelmez", () => {
    const missing = matchLocalVideos([own("c1", "DdJy8QANttn")], [job()], () => undefined);
    expect(missing.files.size).toBe(0);
    expect(missing.notes).toHaveLength(1);
    const bad = matchLocalVideos([own("c1", "DdJy8QANttn")], [job()], () => {
      throw new OrderMediaError("outside_root", "Video dosyası sipariş klasörünün dışına çıkıyor.");
    });
    expect(bad.files.size).toBe(0);
    expect(bad.notes[0]).toContain("dışına çıkıyor");
  });

  it("aynı içerik için ilk çözülebilen iş kazanır; platform uyuşmayan eşleşmez", () => {
    const first = job({ mediaPath: "siparis:hesap/h/yeni/final.mp4" });
    const second = job({ mediaPath: "siparis:hesap/h/eski/final.mp4" });
    expect(matchLocalVideos([own("c1", "DdJy8QANttn")], [first, second], found).files.get("c1")).toContain("yeni");
    expect(matchLocalVideos([{ ...own("c1", "DdJy8QANttn"), platform: "tiktok" }], [job()], found).files.size).toBe(0);
  });
});

function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "eq", "like"]) builder[name] = () => builder;
  builder.order = () => Promise.resolve(result);
  return { from: vi.fn(() => builder) } as unknown as AdminClient;
}

describe("resolveLocalVideos", () => {
  const row = { platform: "instagram", media_path: "siparis:hesap/h/abc/final.mp4", published_permalink: "https://www.instagram.com/reel/DdJy8QANttn/", published_external_id: null };

  it("kendi içerik yoksa DB'ye hiç gitmez", async () => {
    const client = fakeClient({ data: [], error: null });
    const out = await resolveLocalVideos(client, "ws", [rival("r1", "DdJy8QANttn")], { workspaceSlug: "hesap" });
    expect(out.files.size).toBe(0);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("satırları okur, stüdyo hesabıyla dosyayı çözer; eksik dosya sessizce Apify yoluna bırakılır", async () => {
    const ok = await resolveLocalVideos(fakeClient({ data: [row], error: null }), "ws", [own("c1", "DdJy8QANttn")], {
      workspaceSlug: "hesap",
      env: { SIPARIS_KOK: "/k" },
      resolveFile: (root, mediaPath, slug) => `${root}|${slug}|${mediaPath}`,
    });
    expect(ok.files.get("c1")).toBe("/k|hesap|siparis:hesap/h/abc/final.mp4");
    const gone = await resolveLocalVideos(fakeClient({ data: [row], error: null }), "ws", [own("c1", "DdJy8QANttn")], {
      workspaceSlug: "hesap",
      resolveFile: () => {
        throw new OrderMediaError("missing", "Video dosyası bulunamadı.");
      },
    });
    expect(gone.files.size).toBe(0);
  });

  it("okuma hatası fırlatmaz: boş + not", async () => {
    const out = await resolveLocalVideos(fakeClient({ data: null, error: { message: "boom" } }), "ws", [own("c1", "DdJy8QANttn")], { workspaceSlug: "hesap" });
    expect(out.files.size).toBe(0);
    expect(out.notes[0]).toContain("okunamadı");
  });
});
