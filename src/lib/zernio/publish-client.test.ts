import { describe, expect, it, vi } from "vitest";

import { ZernioError } from "@/lib/zernio/client";
import { buildReelPost, createZernioPublishClient } from "@/lib/zernio/publish-client";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function clientWith(responses: Response[]) {
  const fetchImpl = vi.fn(async () => responses.shift() ?? json(500, {}));
  return { client: createZernioPublishClient({ apiKey: "gizli-anahtar", fetchImpl: fetchImpl as unknown as typeof fetch }), fetchImpl };
}
const calls = (fetchImpl: ReturnType<typeof vi.fn>) => fetchImpl.mock.calls.map((c) => `${(c[1] as RequestInit).method} ${String(c[0]).replace("https://zernio.com/api/v1", "")}`);

describe("buildReelPost", () => {
  it("zamanlı gönderi: scheduledFor + timezone, publishNow YOK", () => {
    const post = buildReelPost({ caption: "x", mediaUrl: "https://m/v.mp4", accountId: "a1", thumbOffsetMs: 0, scheduledFor: "2026-10-22T18:00:00" });
    expect(post).toMatchObject({ scheduledFor: "2026-10-22T18:00:00", timezone: "Europe/Istanbul", platforms: [{ accountId: "a1", platformSpecificData: { shareToFeed: true, thumbOffset: 0 } }] });
    expect(post).not.toHaveProperty("publishNow");
  });
  it("saat yoksa hemen yayın", () => {
    expect(buildReelPost({ caption: "x", mediaUrl: "u", accountId: "a1", thumbOffsetMs: 0 })).toMatchObject({ publishNow: true });
  });
});

describe("createZernioPublishClient", () => {
  it("sıra: presign → PUT → POST /posts; anahtar yalnız Zernio çağrılarında, imzalı adrese gönderilmez", async () => {
    const { client, fetchImpl } = clientWith([
      json(200, { uploadUrl: "https://storage.example/up?sig=1", publicUrl: "https://cdn.example/v.mp4" }),
      new Response(null, { status: 200 }),
      json(201, { post: { _id: "p1", status: "scheduled", platforms: [{ platform: "instagram", status: "scheduled" }] } }),
    ]);
    const slot = await client.presign({ filename: "v.mp4", size: 3, contentType: "video/mp4" });
    await client.upload(slot.uploadUrl, new Uint8Array([1, 2, 3]), "video/mp4");
    const created = await client.createPost(buildReelPost({ caption: "c", mediaUrl: slot.publicUrl, accountId: "a1", thumbOffsetMs: 0, scheduledFor: "2026-10-22T18:00:00" }));
    expect(calls(fetchImpl as never)).toEqual(["POST /media/presign", "PUT https://storage.example/up?sig=1", "POST /posts"]);
    expect(created).toMatchObject({ kind: "created", httpStatus: 201, state: { postId: "p1", status: "scheduled" } });
    const putHeaders = ((fetchImpl.mock.calls as unknown as [string, RequestInit][])[1]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(putHeaders.Authorization).toBeUndefined();
  });

  it("409 hata değil: mevcut gönderi kimliğiyle duplicate döner", async () => {
    const { client } = clientWith([json(409, { error: "dup", details: { existingPostId: "p0" } })]);
    await expect(client.createPost(buildReelPost({ caption: "c", mediaUrl: "u", accountId: "a1", thumbOffsetMs: 0 }))).resolves.toEqual({ kind: "duplicate", existingPostId: "p0" });
  });

  it("hata iletisinde anahtar ve gövde yok; yeniden deneme yok (tek çağrı)", async () => {
    const { client, fetchImpl } = clientWith([json(500, { error: "patladı", email: "kisi@ornek.com" })]);
    const error = await client.createPost(buildReelPost({ caption: "c", mediaUrl: "u", accountId: "a1", thumbOffsetMs: 0 })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ZernioError);
    expect((error as Error).message).toContain("500");
    expect((error as Error).message).not.toContain("gizli-anahtar");
    expect((error as Error).message).not.toContain("kisi@ornek.com");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("getPost: GET /posts liste şekli (`{ posts: [...] }`) kimliğe göre seçilir; status ve platforms[].status ikisi de okunur", async () => {
    const body = { posts: [{ _id: "p0", status: "scheduled" }, { _id: "p1", status: "published", platforms: [{ platform: "instagram", status: "published", platformPostUrl: "https://www.instagram.com/reel/ABC/" }] }] };
    const { client } = clientWith([json(200, body)]);
    await expect(client.getPost("p1")).resolves.toEqual({ postId: "p1", status: "published", instagram: { status: "published", permalink: "https://www.instagram.com/reel/ABC/" } });
  });

  it("getPost: Instagram girdisinin durumu, adresi ve hata metni okunur", async () => {
    const { client, fetchImpl } = clientWith([json(200, { post: { _id: "p1", status: "published", platforms: [{ platform: "instagram", status: "published", platformPostUrl: "https://www.instagram.com/reel/ABC/" }] } })]);
    await expect(client.getPost("p1")).resolves.toEqual({ postId: "p1", status: "published", instagram: { status: "published", permalink: "https://www.instagram.com/reel/ABC/" } });
    expect(calls(fetchImpl as never)).toEqual(["GET /posts/p1"]);
  });
});
