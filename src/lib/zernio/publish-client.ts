/**
 * Zernio YAZMA istemcisi (gönderim): `POST /media/presign` → imzalı adrese `PUT` → `POST /posts`; durum okuma `GET /posts/<id>`.
 * Okuma istemcisi (`client.ts`, yalnız GET) AYRI kalır. Panel işçisi (`publish` işi) ve `scripts/zernio-paylas.mts` AYNI işlevleri çağırır.
 *
 * Kurallar: 429/5xx için yeniden deneme YOK (gönderim idempotent değildir; ikinci `POST` yapılmaz, hata çağırana döner).
 * 409 hata DEĞİLDİR: "aynı içerik son 24 saatte bu hesaba gönderilmiş" demektir, mevcut gönderi kimliğiyle `duplicate` döner.
 * Hata iletisi yalnız durum kodu + kısa `error` metni taşır: anahtar ve yanıt gövdesi iletiye girmez. Gönderi gövdesi `buildReelPost` ile kurulur.
 */
import "server-only";

import { z } from "zod";

import { ZERNIO_BASE_URL, ZernioError } from "@/lib/zernio/client";
import { postStateOf, type ZernioPostState } from "@/lib/zernio/schema";

export type { ZernioPostState };

export const ZERNIO_TIMEZONE = "Europe/Istanbul";

export interface ZernioPublishOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface ReelPostInput {
  caption: string;
  /** `presign` sonrası herkese açık video adresi. */
  mediaUrl: string;
  accountId: string;
  /** Kapak karesi, videonun başından milisaniye. */
  thumbOffsetMs: number;
  /** Ofsetsiz yerel zaman `YYYY-AA-GGTSS:DD:00` (İstanbul); yoksa hemen yayın. */
  scheduledFor?: string;
  shareToFeed?: boolean;
}

/** `POST /posts` gövdesi (Instagram Reels). `scheduledFor` verilmezse `publishNow`. */
export function buildReelPost(input: ReelPostInput) {
  return {
    content: input.caption,
    mediaItems: [{ type: "video", url: input.mediaUrl }],
    platforms: [{ platform: "instagram", accountId: input.accountId, platformSpecificData: { shareToFeed: input.shareToFeed ?? true, thumbOffset: input.thumbOffsetMs } }],
    ...(input.scheduledFor ? { scheduledFor: input.scheduledFor, timezone: ZERNIO_TIMEZONE } : { publishNow: true }),
  };
}
export type ReelPost = ReturnType<typeof buildReelPost>;

const presignSchema = z.object({ uploadUrl: z.string().min(1), publicUrl: z.string().min(1) });

export type CreatePostResult =
  | { kind: "created"; httpStatus: number; state: ZernioPostState }
  | { kind: "duplicate"; existingPostId?: string };

export interface ZernioPublishClient {
  presign(file: { filename: string; size: number; contentType: string }): Promise<{ uploadUrl: string; publicUrl: string }>;
  upload(uploadUrl: string, body: Uint8Array, contentType: string): Promise<void>;
  createPost(post: ReelPost): Promise<CreatePostResult>;
  getPost(postId: string): Promise<ZernioPostState>;
}

export function createZernioPublishClient(options: ZernioPublishOptions): ZernioPublishClient {
  const baseUrl = options.baseUrl ?? ZERNIO_BASE_URL;
  const doFetch = options.fetchImpl ?? fetch;
  const auth = { Authorization: `Bearer ${options.apiKey}` };

  async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const res = await doFetch(`${baseUrl}${path}`, {
      method,
      headers: { ...auth, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }
  const detail = (json: unknown): string => {
    const error = (json as { error?: unknown } | null)?.error;
    return typeof error === "string" ? `: ${error.slice(0, 120)}` : "";
  };

  return {
    async presign(file) {
      const { status, json } = await call("POST", "/media/presign", file);
      const parsed = presignSchema.safeParse(json);
      if (status !== 200 || !parsed.success) throw new ZernioError(`Zernio yükleme adresi alınamadı (${status})${detail(json)}`, status);
      return parsed.data;
    },
    async upload(uploadUrl, body, contentType) {
      const res = await doFetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: body as unknown as BodyInit });
      if (!res.ok) throw new ZernioError(`Zernio video yüklemesi başarısız (${res.status})`, res.status);
    },
    async createPost(post) {
      const { status, json } = await call("POST", "/posts", post);
      if (status === 409) {
        const existing = (json as { details?: { existingPostId?: unknown } } | null)?.details?.existingPostId;
        return { kind: "duplicate", ...(typeof existing === "string" ? { existingPostId: existing } : {}) };
      }
      const state = postStateOf(json);
      if ((status !== 201 && status !== 207) || state.postId === undefined) throw new ZernioError(`Zernio gönderisi oluşturulamadı (${status})${detail(json)}`, status);
      return { kind: "created", httpStatus: status, state };
    },
    async getPost(postId) {
      const { status, json } = await call("GET", `/posts/${encodeURIComponent(postId)}`);
      if (status !== 200) throw new ZernioError(`Zernio gönderi durumu okunamadı (${status})${detail(json)}`, status);
      return { ...postStateOf(json, postId), postId };
    },
  };
}
