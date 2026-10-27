import { describe, expect, it, vi } from "vitest";

import { createZernioClient, ZernioError } from "@/lib/zernio/client";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function clientWith(responses: Response[]) {
  const fetchImpl = vi.fn(async () => responses.shift() ?? json(500, {}));
  const sleep = vi.fn(async () => undefined);
  return { client: createZernioClient({ apiKey: "gizli-anahtar", fetchImpl: fetchImpl as unknown as typeof fetch, sleep }), fetchImpl, sleep };
}

describe("createZernioClient", () => {
  it("yalnız GET atar ve anahtarı Authorization başlığında taşır", async () => {
    const { client, fetchImpl } = clientWith([json(200, { accounts: [{ _id: "a1", platform: "instagram", username: "x", isActive: true, followersCount: 46 }] })]);
    const accounts = await client.listAccounts();
    expect(accounts[0]?.followersCount).toBe(46);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://zernio.com/api/v1/accounts");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gizli-anahtar");
  });

  it("429'da Retry-After kadar bekleyip yeniden dener", async () => {
    const { client, sleep } = clientWith([json(429, {}, { "retry-after": "7" }), json(200, { accounts: [] })]);
    await expect(client.listAccounts()).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it("429'da Retry-After yoksa 5 sn, çok büyükse 60 sn ile sınırlar", async () => {
    const a = clientWith([json(429, {}), json(200, { accounts: [] })]);
    await a.client.listAccounts();
    expect(a.sleep).toHaveBeenCalledWith(5000);
    const b = clientWith([json(429, {}, { "retry-after": "999" }), json(200, { accounts: [] })]);
    await b.client.listAccounts();
    expect(b.sleep).toHaveBeenCalledWith(60000);
  });

  it("202'de kısa bekleyip yeniden dener", async () => {
    const { client, sleep, fetchImpl } = clientWith([json(202, {}), json(202, {}), json(200, { accounts: [] })]);
    await client.listAccounts();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => (c as unknown as number[])[0])).toEqual([2000, 4000]);
  });

  it("deneme sınırı dolunca hata verir; iletide anahtar ve gövde yoktur", async () => {
    const fetchImpl = vi.fn(async () => json(401, { error: "yetkisiz", email: "kisi@ornek.com" }));
    const client = createZernioClient({ apiKey: "gizli-anahtar", fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => undefined });
    const error = await client.listAccounts().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ZernioError);
    expect((error as ZernioError).status).toBe(401);
    expect((error as ZernioError).message).toContain("401");
    expect((error as ZernioError).message).not.toContain("gizli-anahtar");
    expect((error as ZernioError).message).not.toContain("kisi@ornek.com");
  });

  it("gönderi sayfalarını birleştirir", async () => {
    const post = (n: number) => ({ platformPostUrl: `https://www.instagram.com/reel/AAAAA${n}/`, status: "published", platform: "instagram" });
    const { client, fetchImpl } = clientWith([
      json(200, { posts: [post(1)], pagination: { pages: 2 } }),
      json(200, { posts: [post(2)], pagination: { pages: 2 } }),
    ]);
    const posts = await client.listPosts();
    expect(posts).toHaveLength(2);
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toContain("page=2");
  });
});
