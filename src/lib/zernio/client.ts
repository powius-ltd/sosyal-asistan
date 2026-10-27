/**
 * Zernio salt-okunur istemci (YALNIZ GET: hesap listesi + gönderi analitiği). Gönderi / yükleme / silme çağrısı yoktur.
 *
 * - 429: `Retry-After` saniyesi kadar bekler (yoksa 5 sn; üst sınır 60 sn), en çok `maxRetries` kez.
 * - 202: analitik hazırlanıyor demektir; kısa bekleyip yeniden dener (2 sn × deneme).
 * - Hata iletisi yalnız durum kodu + kısa `error` metni taşır: anahtar ve yanıt gövdesi (kişisel veri) iletiye girmez.
 */
import "server-only";

import { zernioAccountsResponseSchema, zernioAnalyticsResponseSchema, type ZernioAccount, type ZernioPost } from "@/lib/zernio/schema";

export const ZERNIO_BASE_URL = "https://zernio.com/api/v1";
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

export class ZernioError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ZernioError";
  }
}

export interface ZernioClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

export interface ZernioClient {
  listAccounts(): Promise<ZernioAccount[]>;
  /** Bağlı hesapların tüm gönderileri (sayfalar birleşir), `source=all`. */
  listPosts(): Promise<ZernioPost[]>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createZernioClient(options: ZernioClientOptions): ZernioClient {
  const baseUrl = options.baseUrl ?? ZERNIO_BASE_URL;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 5;

  async function get(path: string): Promise<unknown> {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const res = await doFetch(`${baseUrl}${path}`, { method: "GET", headers: { Authorization: `Bearer ${options.apiKey}` } });
      if (res.status === 429 && attempt < maxRetries) {
        const seconds = Number(res.headers.get("retry-after"));
        await sleep(Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds : 5, 60) * 1000);
        continue;
      }
      if (res.status === 202 && attempt < maxRetries) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (res.status !== 200) {
        const detail = await res.json().then((body: unknown) => (typeof (body as { error?: unknown })?.error === "string" ? (body as { error: string }).error.slice(0, 120) : undefined)).catch(() => undefined);
        throw new ZernioError(`Zernio isteği başarısız (${res.status})${detail ? `: ${detail}` : ""}`, res.status);
      }
      return res.json();
    }
    throw new ZernioError("Zernio isteği yeniden deneme sınırını aştı");
  }

  return {
    async listAccounts() {
      return zernioAccountsResponseSchema.parse(await get("/accounts")).accounts;
    },
    async listPosts() {
      const posts: ZernioPost[] = [];
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const parsed = zernioAnalyticsResponseSchema.parse(await get(`/analytics?source=all&limit=${PAGE_LIMIT}&page=${page}`));
        posts.push(...parsed.posts);
        if (page >= (parsed.pagination?.pages ?? 1)) break;
      }
      return posts;
    },
  };
}
