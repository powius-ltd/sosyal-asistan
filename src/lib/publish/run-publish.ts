/**
 * `publish` işi: onaylı stüdyo videolarını sağlayıcıya zamanlar ve yayınlananları kapatır. Yalnız `order_id` dolu ve `siparis:` medyalı
 * satırlara dokunur. Sıra: `approved` → (koşullu sahiplenme) `publishing` → sağlayıcı `schedule` → `ready` (container_id = gönderi kimliği)
 * → sonraki turda `poll` → `published` + fişe geri yazım (YALNIZ `durum`, `zernio_post_id`, `yayin_url`) + fikir bağı.
 * Aynı işte İKİNCİ gönderim olmaz: sahiplenme koşulludur, kimliği satırda olan `publishing` satırında yalnız `markReady` yeniden denenir, kimliksiz takılı satır
 tek bildirimle "elle kontrol" olur (işi düşürmez), 409 gönderiyi izler. `createPost` ÖNCESİ hata
 * `failed` olur (yeniden deneme yok; yeni satır ister); `createPost` başladıktan sonraki hata ya da `markReady` hatası `failed` DEĞİL, `publishing`'te
 * takılı kalır (`unconfirmed`, postId günlükte): "Yeniden dene" ikinci gönderim açamaz. Onaysız satır görünmez bile (yalnız `approved` ve sonrası okunur); 24 saatten eski
 * onay ve geçmiş / boş saat gönderilmez.
 */
import "server-only";
import { readFileSync } from "node:fs";

import { isJobApprovalFresh } from "@/lib/domain/panel-job";
import { orderPublishedNotice, orderStuckNotice, orderUnverifiedNotice, type PublishNoticeDraft } from "@/lib/plain-language-order";
import { OrderMediaError, resolveOrderMedia } from "@/lib/publish/order-media";
import { PostOutcomeUnknownError, ProviderError, type PublishProvider } from "@/lib/publish/provider";
import { DAY_MS } from "@/lib/time";
import { markTicketPublished } from "@/lib/studio-order/publish";
import { readTicket } from "@/lib/studio-order/ticket-file";
import { findTicketPath, nodeTicketIo, replaceTicketFile, type TicketIo } from "@/lib/studio-order/ticket-io";
import type { Ticket } from "@/lib/studio-order/schema";

export type PublishFailure = "approval_stale" | "schedule_in_past" | "media_unreadable" | "provider_error" | "zernio_account_missing" | "zernio_account_ambiguous" | "provider_failed";

export interface OrderPublishRow {
  id: string;
  orderId: string;
  status: "approved" | "publishing" | "ready";
  caption: string;
  mediaPath: string;
  scheduledFor?: string;
  approvedAt?: string;
  /** Sağlayıcının gönderi kimliği (`ready`). */
  containerId?: string;
  accountHandle: string;
}

export interface PublishStore {
  /** `order_id` dolu, `siparis:` medyalı, durumu approved | publishing | ready olan satırlar. */
  listRows(): Promise<OrderPublishRow[]>;
  /** approved → publishing (koşullu). false = satır artık approved değil (başkası aldı): GÖNDERİLMEZ. */
  claim(id: string): Promise<boolean>;
  markReady(id: string, postId: string): Promise<void>;
  /** `markReady` düşünce gönderi kimliğini satıra (container_id) durum DEĞİŞTİRMEDEN yazar; sonraki tur `markReady`'yi yeniden dener. */
  savePostId(id: string, postId: string): Promise<void>;
  markPublished(id: string, input: { permalink?: string; publishedAt: string }): Promise<void>;
  markFailed(id: string, code: PublishFailure, message: string): Promise<void>;
  notify(draft: PublishNoticeDraft & { dedupeKey: string }): Promise<boolean>;
}

export interface RunPublishInput {
  root: string;
  studioSlug: string;
  now: Date;
  store: PublishStore;
  provider: PublishProvider;
  /** Fikri yayına bağlar (hata fırlatabilir; günlüğe yazılır, işi düşürmez). */
  linkIdea?: (ticket: Ticket, url: string | undefined) => Promise<unknown>;
  log?: (line: string) => void;
}

export interface RunPublishResult {
  scheduled: string[];
  published: string[];
  failed: { orderId: string; code: PublishFailure }[];
  /** `publishing`te takılı (gönderim sonucu bilinmiyor): dokunulmadı. */
  stuck: string[];
  /** Gönderim başladıktan sonra sonucu doğrulanamayan satırlar (`publishing`'te kaldı); `postId` biliniyorsa elle kontrol için. */
  unconfirmed: { orderId: string; postId?: string }[];
  /** Önceki turlardan `publishing`'te kalmış, kimliği bilinmeyen satırlar: bildirimle "elle kontrol" denir, işi düşürmez. */
  manual: { orderId: string }[];
  /** `ready` satırı, planlanan saatin üstünden `UNVERIFIED_AFTER_MS` geçtiği hâlde yayını doğrulanamayan (yoklama hatası / bilinmeyen durum): satır değişmez, tek bildirimle "elle kontrol". */
  unverified: { orderId: string }[];
  waiting: number;
}

/** Planlanan saatten bu kadar sonra hâlâ `ready` + yayın doğrulanamıyorsa elle kontrol bildirimi (TEK eşik). */
export const UNVERIFIED_AFTER_MS = DAY_MS;

/**
 * Fiş geri yazımı: yalnız paylasildi / zernio_post_id / yayin_url. Zaten paylaşılmış fişe dokunmaz. true = yazıldı.
 * Yazmadan önce fiş yeniden okunur ve ilk okunanla karşılaştırılır (stüdyo ya da kullanıcı arada düzenlediyse ÜZERİNE YAZILMAZ, hata);
 * yazım geçici dosya + `rename` ile yapılır (yarım dosya kalmaz).
 */
export function writeBackTicket(path: string, postId: string, url: string | undefined, io: TicketIo = nodeTicketIo): { written: boolean; ticket: Ticket } {
  const text = io.read(path);
  const { ticket } = readTicket(text);
  if (ticket.durum === "paylasildi" && ticket.zernio_post_id) return { written: false, ticket };
  const next = markTicketPublished(text, postId, url);
  if (!replaceTicketFile(path, text, next, io)) throw new Error("Fiş geri yazımdan önce değişti; üzerine yazılmadı.");
  return { written: true, ticket: readTicket(io.read(path)).ticket };
}

export async function runPublish(input: RunPublishInput): Promise<RunPublishResult> {
  const { store, provider, now } = input;
  const log = input.log ?? (() => undefined);
  const result: RunPublishResult = { scheduled: [], published: [], failed: [], stuck: [], unconfirmed: [], manual: [], unverified: [], waiting: 0 };
  const fail = async (row: OrderPublishRow, code: PublishFailure, message: string) => {
    await store.markFailed(row.id, code, message);
    result.failed.push({ orderId: row.orderId, code });
  };

  /** Yoklama başarısız / durum bilinmiyor: bekle; ama saatin üstünden bir gün geçtiyse (dedupe'lu) tek bildirimle elle kontrol iste. Satır durumu değişmez. */
  const noteUnverified = async (row: OrderPublishRow) => {
    result.waiting += 1;
    if (!row.scheduledFor || now.getTime() - Date.parse(row.scheduledFor) < UNVERIFIED_AFTER_MS) return;
    result.unverified.push({ orderId: row.orderId });
    await store.notify({ ...orderUnverifiedNotice({ orderId: row.orderId }), dedupeKey: `order_unverified:${row.orderId}` }).catch((e: Error) => log(`bildirim yazılamadı: ${e.message}`));
  };

  for (const row of await store.listRows()) {
    if (row.status === "publishing") {
      if (row.containerId) {
        // Önceki turda gönderi açıldı ama `markReady` düştü: kimlik satırda, ikinci POST YOK; yalnız işaretleme yeniden denenir.
        try {
          await store.markReady(row.id, row.containerId);
          result.scheduled.push(row.orderId);
        } catch (e) {
          log(`markReady yeniden denemesi başarısız ${row.orderId}: gönderi kimliği ${row.containerId} (${(e as Error).message})`);
          result.stuck.push(row.orderId);
          result.unconfirmed.push({ orderId: row.orderId, postId: row.containerId });
        }
        continue;
      }
      // Gönderim sonucu bilinmiyor: ikinci gönderim riskine girilmez; tek bildirimle elle kontrol istenir, iş düşmez.
      result.manual.push({ orderId: row.orderId });
      await store.notify({ ...orderStuckNotice({ orderId: row.orderId }), dedupeKey: `order_stuck:${row.orderId}` }).catch((e: Error) => log(`bildirim yazılamadı: ${e.message}`));
      continue;
    }

    if (row.status === "ready") {
      if (!row.containerId) {
        await fail(row, "provider_failed", "Gönderi kimliği yok.");
        continue;
      }
      let poll;
      try {
        poll = await provider.poll(row.containerId);
      } catch (e) {
        log(`poll hatası ${row.orderId}: ${(e as Error).message}`);
        await noteUnverified(row);
        continue;
      }
      if (poll.kind === "unknown") {
        log(`bilinmeyen Zernio durumu ${row.orderId}: ${poll.status ?? "yok"}; bekleniyor`);
        await noteUnverified(row);
      } else if (poll.kind === "scheduled") {
        result.waiting += 1;
      } else if (poll.kind === "failed") {
        await fail(row, "provider_failed", poll.reason);
      } else {
        await store.markPublished(row.id, { ...(poll.permalink ? { permalink: poll.permalink } : {}), publishedAt: now.toISOString() });
        result.published.push(row.orderId);
        const path = findTicketPath(input.root, input.studioSlug, row.orderId);
        if (path) {
          try {
            const back = writeBackTicket(path, row.containerId, poll.permalink);
            if (back.written && input.linkIdea) await input.linkIdea(back.ticket, poll.permalink).catch((e: Error) => log(`fikir bağı kurulamadı ${row.orderId}: ${e.message}`));
          } catch (e) {
            log(`fiş geri yazımı başarısız ${row.orderId}: ${(e as Error).message}`);
          }
        } else log(`fiş bulunamadı ${row.orderId}; geri yazım yapılmadı`);
        await store.notify({ ...orderPublishedNotice({ orderId: row.orderId, ...(poll.permalink ? { url: poll.permalink } : {}) }), dedupeKey: `order_published:${row.orderId}` }).catch((e: Error) => log(`bildirim yazılamadı: ${e.message}`));
      }
      continue;
    }

    // approved → gönder
    if (!row.approvedAt || !isJobApprovalFresh(row.approvedAt, now)) {
      await fail(row, "approval_stale", "Onay 24 saatten eski; yeni satırla yeniden onaya gönder.");
      continue;
    }
    const at = row.scheduledFor ? new Date(row.scheduledFor) : undefined;
    if (!at || Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) {
      await fail(row, "schedule_in_past", "Planlanan saat geçti ya da yok; yeni satırla yeni saat seç.");
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(resolveOrderMedia(input.root, row.mediaPath, input.studioSlug));
    } catch (e) {
      await fail(row, "media_unreadable", e instanceof OrderMediaError ? e.message : "Video dosyası okunamadı.");
      continue;
    }
    if (!(await store.claim(row.id))) {
      log(`sahiplenilemedi ${row.orderId}; başka süreç aldı`);
      continue;
    }
    try {
      const out = await provider.schedule({
        caption: row.caption,
        file: { name: row.mediaPath.split("/").pop() ?? "video.mp4", bytes },
        thumbOffsetMs: 0,
        scheduledAt: at,
        accountHandle: row.accountHandle,
      });
      const postId = out.kind === "scheduled" ? out.postId : out.existingPostId;
      if (!postId) {
        // 409 ama kimlik yok: gönderi Zernio'da VAR; `failed` olsaydı yeni satır ikinci gönderim açardı. `publishing`'te takılı kalır, elle kontrol.
        log(`409 ama gönderi kimliği yok ${row.orderId}; satır publishing'te bırakıldı, Zernio'dan elle kontrol et`);
        result.stuck.push(row.orderId);
        result.unconfirmed.push({ orderId: row.orderId });
        continue;
      }
      try {
        await store.markReady(row.id, postId);
      } catch (e) {
        // Gönderi Zernio'da var ama satır işaretlenemedi: `publishing`'te kalır (failed olsaydı yeniden gönderilirdi); postId kayda geçer.
        log(`markReady başarısız ${row.orderId}: gönderi kimliği ${postId}; satır publishing'te bırakıldı (${(e as Error).message})`);
        await store.savePostId(row.id, postId).catch((err: Error) => log(`gönderi kimliği satıra yazılamadı ${row.orderId}: ${err.message}`));
        result.stuck.push(row.orderId);
        result.unconfirmed.push({ orderId: row.orderId, postId });
        continue;
      }
      result.scheduled.push(row.orderId);
    } catch (e) {
      if (e instanceof PostOutcomeUnknownError) {
        log(`gönderim sonucu bilinmiyor ${row.orderId}: ${e.message}; satır publishing'te bırakıldı, Zernio'dan elle kontrol et`);
        result.stuck.push(row.orderId);
        result.unconfirmed.push({ orderId: row.orderId });
        continue;
      }
      const code: PublishFailure = e instanceof ProviderError ? e.code : "provider_error";
      await fail(row, code, e instanceof Error ? e.message.slice(0, 300) : "Gönderim başarısız.");
    }
  }
  return result;
}
