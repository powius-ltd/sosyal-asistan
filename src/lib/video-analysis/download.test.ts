import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { downloadVideo } from "@/lib/video-analysis/download";
import { VideoAnalysisError } from "@/lib/video-analysis/errors";
import { cdnUrl, createFakeFetch, makeBaseDir, NOW, redirectResponse, streamOf, videoResponse } from "@/lib/video-analysis/test-support";

const base = makeBaseDir();
afterAll(() => base.cleanup());

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(path.join(base.dir, "dl-"));
});

const opts = () => ({ dir, now: () => NOW });

async function kindOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return error instanceof VideoAnalysisError ? error.kind : "başka-hata";
  }
  return undefined;
}

describe("downloadVideo", () => {
  it("videoyu klasöre yazar; bayt sayısı, content-type ve dosya adını döndürür", async () => {
    const fake = createFakeFetch(() => videoResponse(1234));
    const result = await downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch });
    expect(result).toMatchObject({ fileName: "video.mp4", bytes: 1234, contentType: "video/mp4", redirects: 0 });
    expect(readFileSync(path.join(dir, "video.mp4"))).toHaveLength(1234);
    expect(fake.urls).toHaveLength(1);
    expect(fake.inits[0]).toMatchObject({ redirect: "manual" }); // yönlendirmeyi fetch değil biz izleriz
  });

  it("izinli CDN'e yönlendirmeyi izler; her adımda alan adını yeniden doğrular", async () => {
    const second = cdnUrl(3600, "video-xyz.fbcdn.net");
    const fake = createFakeFetch((_url, n) => (n === 0 ? redirectResponse(second) : videoResponse(50)));
    const result = await downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch });
    expect(result.redirects).toBe(1);
    expect(fake.urls[1]).toBe(second);
  });

  it("göreli Location'ı taban adrese göre çözer", async () => {
    const fake = createFakeFetch((_url, n) => (n === 0 ? redirectResponse("/v/other.mp4?oe=FFFFFFF0") : videoResponse(10)));
    await downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch });
    expect(new URL(fake.urls[1]).hostname).toBe("scontent-abc1-1.cdninstagram.com");
  });

  it("izinli adresten izinsiz alan adına yönlendirmeyi REDDEDER ve o adrese istek atmaz", async () => {
    const fake = createFakeFetch((_url, n) => (n === 0 ? redirectResponse("https://evil.cdninstagram.com.attacker.com/clip.mp4") : videoResponse(10)));
    expect(await kindOf(downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch }))).toBe("invalid_url");
    expect(fake.urls).toHaveLength(1);
    expect(existsSync(path.join(dir, "video.mp4"))).toBe(false);
  });

  it("http'ye düşürme yönlendirmesini reddeder", async () => {
    const fake = createFakeFetch((_url, n) => (n === 0 ? redirectResponse("http://x.cdninstagram.com/clip.mp4") : videoResponse(10)));
    expect(await kindOf(downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch }))).toBe("invalid_url");
    expect(fake.urls).toHaveLength(1);
  });

  it("en çok 3 yönlendirme izler; dördüncüde redirect_limit", async () => {
    const hop = cdnUrl(3600, "hop.cdninstagram.com");
    const ok3 = createFakeFetch((_u, n) => (n < 3 ? redirectResponse(hop) : videoResponse(10)));
    await expect(downloadVideo(cdnUrl(), { ...opts(), fetch: ok3.fetch })).resolves.toMatchObject({ redirects: 3 });

    const loop = createFakeFetch(() => redirectResponse(hop));
    expect(await kindOf(downloadVideo(cdnUrl(), { ...opts(), fetch: loop.fetch }))).toBe("redirect_limit");
    expect(loop.urls).toHaveLength(4); // ilk istek + 3 yönlendirme; dördüncü yönlendirmeye gidilmez
  });

  it("Location başlığı olmayan yönlendirme → http_error", async () => {
    const fake = createFakeFetch(() => new Response(null, { status: 302 }));
    expect(await kindOf(downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch }))).toBe("http_error");
  });

  it("content-type video/* değilse not_video (gövde okunmaz, dosya yazılmaz)", async () => {
    const fake = createFakeFetch(() => new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }));
    expect(await kindOf(downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch }))).toBe("not_video");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("content-type video/mp4; codecs=… parametresini tolere eder", async () => {
    const fake = createFakeFetch(() => videoResponse(20, { "content-type": "Video/MP4; codecs=avc1" }));
    await expect(downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch })).resolves.toMatchObject({ contentType: "video/mp4" });
  });

  it("HTTP hata kodunda http_error (adres iletide yok)", async () => {
    const fake = createFakeFetch(() => new Response("yasak", { status: 403 }));
    try {
      await downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch });
      expect.unreachable();
    } catch (error) {
      expect((error as VideoAnalysisError).kind).toBe("http_error");
      expect((error as Error).message).toContain("403");
      expect((error as Error).message).not.toContain("secret-token");
    }
  });

  it("content-length tavanı aşıyorsa gövdeyi okumadan too_large", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(10));
      },
    });
    const fake = createFakeFetch(() => new Response(body, { status: 200, headers: { "content-type": "video/mp4", "content-length": "5000" } }));
    expect(await kindOf(downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch, maxBytes: 1000 }))).toBe("too_large");
    expect(pulled).toBeLessThanOrEqual(1); // akışın ilk parçasından öteye gidilmedi
    expect(existsSync(path.join(dir, "video.mp4"))).toBe(false);
  });

  it("akış sırasında SAYARAK keser (content-length yalan söylese de): too_large, yarım dosya silinir", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(400));
        if (pulled >= 1000) controller.close();
      },
    });
    const fake = createFakeFetch(() => new Response(body, { status: 200, headers: { "content-type": "video/mp4" } }));
    expect(await kindOf(downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch, maxBytes: 1000 }))).toBe("too_large");
    expect(pulled).toBeLessThan(10); // 1000 baytı aşınca durdu, akışın geri kalanı çekilmedi
    expect(existsSync(path.join(dir, "video.mp4"))).toBe(false);
  });

  it("tam tavan boyutundaki videoyu kabul eder", async () => {
    const fake = createFakeFetch(() => videoResponse(1000));
    await expect(downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch, maxBytes: 1000 })).resolves.toMatchObject({ bytes: 1000 });
  });

  it("boş gövde → empty_download", async () => {
    const fake = createFakeFetch(() => new Response(streamOf([]), { status: 200, headers: { "content-type": "video/mp4" } }));
    expect(await kindOf(downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch }))).toBe("empty_download");
  });

  it("süresi dolmuş oe: HİÇ istek yapmadan expired_url", async () => {
    const fake = createFakeFetch(() => videoResponse(10));
    expect(await kindOf(downloadVideo(cdnUrl(-60), { ...opts(), fetch: fake.fetch }))).toBe("expired_url");
    expect(fake.urls).toHaveLength(0);
  });

  it("izinsiz alan adı: HİÇ istek yapmadan invalid_url", async () => {
    const fake = createFakeFetch(() => videoResponse(10));
    expect(await kindOf(downloadVideo("https://evil.cdninstagram.com.attacker.com/a.mp4", { ...opts(), fetch: fake.fetch }))).toBe("invalid_url");
    expect(fake.urls).toHaveLength(0);
  });

  it("zaman aşımı AbortController ile: bekleyen istek iptal edilir → download_timeout", async () => {
    const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as typeof fetch;
    expect(await kindOf(downloadVideo(cdnUrl(), { ...opts(), fetch: hanging, timeoutMs: 30 }))).toBe("download_timeout");
  });

  it("akış ortasında zaman aşımı da download_timeout; yarım dosya silinir", async () => {
    const stalled = ((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(10));
          init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
        },
      });
      return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "video/mp4" } }));
    }) as typeof fetch;
    expect(await kindOf(downloadVideo(cdnUrl(), { ...opts(), fetch: stalled, timeoutMs: 30 }))).toBe("download_timeout");
    expect(existsSync(path.join(dir, "video.mp4"))).toBe(false);
  });

  it("ağ hatası download_failed; hata iletisi altta yatan ayrıntıyı (adres) taşımaz", async () => {
    const broken = (() => Promise.reject(new TypeError("fetch failed: https://x.cdninstagram.com/a?oh=secret-token"))) as typeof fetch;
    try {
      await downloadVideo(cdnUrl(), { ...opts(), fetch: broken });
      expect.unreachable();
    } catch (error) {
      expect((error as VideoAnalysisError).kind).toBe("download_failed");
      expect((error as Error).message).not.toContain("secret-token");
    }
  });

  it("dosya adında klasör ayracı olamaz", async () => {
    const fake = createFakeFetch(() => videoResponse(10));
    expect(await kindOf(downloadVideo(cdnUrl(), { ...opts(), fetch: fake.fetch, fileName: "../escape.mp4" }))).toBe("invalid_input");
    expect(fake.urls).toHaveLength(0);
  });
});
