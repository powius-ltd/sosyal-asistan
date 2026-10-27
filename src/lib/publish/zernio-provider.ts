/**
 * `PublishProvider`'ın Zernio uygulaması: hesabı çalışma alanının tutamağına göre `listAccounts` ile seçer (eşleşme yok ya da birden çok →
 * `ProviderError`), videoyu yükler (presign → PUT) ve zamanlı gönderiyi açar. Her çağrı için bir kez `POST /posts`; yeniden deneme yok.
 */
import "server-only";

import { PostOutcomeUnknownError, ProviderError, type PollOutcome, type PublishProvider, type ScheduleOutcome, type ScheduleRequest } from "@/lib/publish/provider";
import { zernioScheduledFor } from "@/lib/publish/order-time";
import { ZernioError, type ZernioClient } from "@/lib/zernio/client";
import { buildReelPost, type ZernioPublishClient } from "@/lib/zernio/publish-client";

export interface ZernioProviderDeps {
  publish: ZernioPublishClient;
  read: Pick<ZernioClient, "listAccounts">;
}

/** Zernio'nun "henüz yayınlanmadı ama düşmedi" durumları; listede olmayan durum `unknown` döner (başarısız sayılmaz, beklenir). */
const WAITING_STATUSES: ReadonlySet<string> = new Set(["scheduled", "pending", "queued", "publishing", "processing", "draft"]);

const normalizeHandle = (value: string | null | undefined): string => (value ?? "").trim().replace(/^@/, "").toLowerCase();

export function createZernioProvider(deps: ZernioProviderDeps): PublishProvider {
  async function accountIdOf(handle: string): Promise<string> {
    const wanted = normalizeHandle(handle);
    const matches = (await deps.read.listAccounts()).filter((a) => a.platform === "instagram" && a.isActive !== false && normalizeHandle(a.username) === wanted);
    if (matches.length === 0) throw new ProviderError("zernio_account_missing", `Zernio'da @${wanted} adlı etkin Instagram hesabı yok.`);
    if (matches.length > 1) throw new ProviderError("zernio_account_ambiguous", `Zernio'da @${wanted} ile eşleşen birden çok hesap var.`);
    return (matches[0] as { _id: string })._id;
  }

  return {
    async schedule(request: ScheduleRequest): Promise<ScheduleOutcome> {
      const accountId = await accountIdOf(request.accountHandle);
      const slot = await deps.publish.presign({ filename: request.file.name, size: request.file.bytes.byteLength, contentType: "video/mp4" });
      await deps.publish.upload(slot.uploadUrl, request.file.bytes, "video/mp4");
      const post = buildReelPost({ caption: request.caption, mediaUrl: slot.publicUrl, accountId, thumbOffsetMs: request.thumbOffsetMs, scheduledFor: zernioScheduledFor(request.scheduledAt) });
      let created;
      try {
        created = await deps.publish.createPost(post);
      } catch (e) {
        // Kesin ret (400–499, 409 hariç; 409 `createPost` içinde `duplicate` döner): gönderi oluşmadı → satır `failed`. 5xx / ağ / okunamayan yanıt: belirsiz.
        if (e instanceof ZernioError && e.status !== undefined && e.status >= 400 && e.status <= 499 && e.status !== 409) {
          throw new ProviderError("provider_error", e.message.slice(0, 300));
        }
        throw new PostOutcomeUnknownError(`Gönderi isteği sonuçsuz kaldı: ${e instanceof Error ? e.message.slice(0, 200) : "bilinmeyen hata"}`);
      }
      if (created.kind === "duplicate") return { kind: "duplicate", ...(created.existingPostId ? { existingPostId: created.existingPostId } : {}) };
      return { kind: "scheduled", postId: created.state.postId as string };
    },

    async poll(postId: string): Promise<PollOutcome> {
      const state = await deps.publish.getPost(postId);
      const igStatus = state.instagram?.status ?? state.status;
      if (igStatus === "published") return { kind: "published", ...(state.instagram?.permalink ? { permalink: state.instagram.permalink } : {}) };
      if (igStatus === "failed" || igStatus === "error") return { kind: "failed", reason: state.instagram?.errorMessage?.slice(0, 200) ?? "Zernio gönderiyi yayınlayamadı." };
      if (igStatus !== undefined && WAITING_STATUSES.has(igStatus.toLowerCase())) return { kind: "scheduled" };
      return { kind: "unknown", ...(igStatus === undefined ? {} : { status: igStatus.slice(0, 40) }) };
    },
  };
}
