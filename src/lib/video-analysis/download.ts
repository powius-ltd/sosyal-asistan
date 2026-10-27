/**
 * Videoyu Instagram CDN'inden GEÇİCİ klasöre indirir (kalıcı saklama yok; klasörü çağıran `withTempDir` siler).
 *
 * Güvenlik/sınırlar:
 *  - Her adres `assertDownloadableUrl` ile denetlenir (yalnız https + CDN alan adları + `oe` süresi).
 *  - Yönlendirme ELLE izlenir (`redirect: "manual"`, en çok 3 adım) ve her adımda alan adı yeniden doğrulanır: izinli bir adres
 *    izinsiz bir yere yönlendiremez.
 *  - `content-type` `video/*` olmalı. Boyut tavanı (varsayılan 60 MB) hem `content-length` ile hem akış sırasında SAYARAK uygulanır.
 *  - Tüm indirme tek `AbortController` zaman aşımı altındadır (bağlantı + akış).
 *  - Hata iletisine adres yazılmaz; yarım dosya silinir. `fetch` ve `now` enjekte edilir.
 */
import "server-only";

import { open, unlink } from "node:fs/promises";
import path from "node:path";

import { assertDownloadableUrl } from "@/lib/video-analysis/download-url";
import { VideoAnalysisError } from "@/lib/video-analysis/errors";

export const DEFAULT_MAX_DOWNLOAD_BYTES = 60 * 1024 * 1024;
export const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000;
export const MAX_REDIRECTS = 3;
export const DEFAULT_VIDEO_FILE_NAME = "video.mp4";

export interface DownloadOptions {
  /** Dosyanın yazılacağı klasör (`withTempDir`'in verdiği). */
  dir: string;
  /** Yalnız dosya adı (klasör ayracı yok). */
  fileName?: string;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

export interface DownloadedVideo {
  fileName: string;
  path: string;
  bytes: number;
  contentType: string;
  redirects: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // gövde zaten kapalı
  }
}

/** Akışı dosyaya yazar; `maxBytes` aşılırsa kesip `too_large` fırlatır. Yazılan bayt sayısını döndürür. */
async function writeCapped(response: Response, filePath: string, maxBytes: number): Promise<number> {
  const body = response.body;
  if (!body) throw new VideoAnalysisError("empty_download", "İndirilen video boş.");
  const reader = body.getReader();
  const handle = await open(filePath, "w");
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new VideoAnalysisError("too_large", `Video ${mb(maxBytes)} sınırını aşıyor.`);
      }
      await handle.write(value);
    }
  } finally {
    await handle.close();
  }
  return total;
}

export async function downloadVideo(url: string, options: DownloadOptions): Promise<DownloadedVideo> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const fileName = options.fileName ?? DEFAULT_VIDEO_FILE_NAME;
  if (path.basename(fileName) !== fileName) throw new VideoAnalysisError("invalid_input", "Dosya adı klasör içeremez.");
  const filePath = path.join(options.dir, fileName);

  // Hiçbir istek yapmadan önce: adres ve `oe` süresi.
  let current = assertDownloadableUrl(url, now());

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS);

  try {
    let redirects = 0;
    for (;;) {
      const response = await fetchImpl(current.href, { redirect: "manual", signal: controller.signal, headers: { accept: "video/*" } });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await discardBody(response);
        if (!location) throw new VideoAnalysisError("http_error", `Video sunucusu yönlendirme adresi vermedi (HTTP ${response.status}).`);
        if (redirects >= maxRedirects) throw new VideoAnalysisError("redirect_limit", `Video adresi ${maxRedirects} adımdan fazla yönlendiriyor.`);
        redirects += 1;
        current = assertDownloadableUrl(location, now(), current); // yeni adım da aynı denetimden geçer
        continue;
      }
      if (!response.ok) {
        await discardBody(response);
        throw new VideoAnalysisError("http_error", `Video sunucusu hata döndürdü (HTTP ${response.status}).`);
      }

      const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!contentType.startsWith("video/")) {
        await discardBody(response);
        throw new VideoAnalysisError("not_video", `Yanıt bir video değil (content-type: ${contentType || "yok"}).`);
      }
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) {
        await discardBody(response);
        throw new VideoAnalysisError("too_large", `Video ${mb(declared)}; sınır ${mb(maxBytes)}.`);
      }

      const bytes = await writeCapped(response, filePath, maxBytes);
      if (bytes === 0) throw new VideoAnalysisError("empty_download", "İndirilen video boş.");
      return { fileName, path: filePath, bytes, contentType, redirects };
    }
  } catch (error) {
    await unlink(filePath).catch(() => undefined); // yarım dosya kalmasın
    if (error instanceof VideoAnalysisError) throw error;
    if (timedOut) throw new VideoAnalysisError("download_timeout", "Video indirme zaman aşımına uğradı.");
    throw new VideoAnalysisError("download_failed", "Video indirilemedi (ağ hatası).");
  } finally {
    clearTimeout(timer);
  }
}
