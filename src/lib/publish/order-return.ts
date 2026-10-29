/**
 * `order_return` işi: stüdyonun `uretildi` fişlerini tarar, her biri için TEK `awaiting_approval` yayın satırı açar ve TEK bildirim yazar.
 * Onay verilmez (onay yalnız insanda: `publish_jobs_guard`); gönderim yok. Aynı sipariş ikinci kez açılmaz (`hasJobForOrder` iptal edilmiş siparişi de "işlenmiş" sayar (kalıcı ret); yalnız başarısız / süresi dolmuş sipariş yeniden açılır). Uyum `fail` ise satır `draft` açılır ve bildirim nedenini söyler. Dosya erişimi `root`
 * altında kalır (`order-media.ts`); store enjekte edilir (gerçek bağlama `order-return-store.ts`).
 */
import "server-only";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import type { CreatePublishJobInput } from "@/lib/data/queries";
import { ComplianceFailedError, RepositoryError } from "@/lib/data/repository";
import { isAiGeneratedOrder, withAiDisclosure } from "@/lib/publish/ai-disclosure-line";
import { OrderMediaError, toOrderMediaPath } from "@/lib/publish/order-media";
import { istanbulStampToUtc } from "@/lib/publish/order-time";
import { AI_DISCLOSURE_PROBLEM_PLAIN, orderDraftNotice, orderReadyNotice, SCHEDULE_PAST_NOTE_PLAIN, type PublishNoticeDraft } from "@/lib/plain-language-order";
import { readTicket } from "@/lib/studio-order/ticket-file";

export interface OrderReturnStore {
  hasJobForOrder(orderId: string): Promise<boolean>;
  /**
   * SPN-36: bu sipariş kimliği, revizeyle yerini yitirmiş ESKİ bir video sürümüne mi ait? Eski sürümün dosyası dönse bile yayın onayına açılmaz
   * (yalnız güncel sürüm açılır). Verilmezse (eski bağlama / testler) her sürüm güncel sayılır.
   */
  isSupersededOrder?(orderId: string): Promise<boolean>;
  /** Çalışma alanının yayına açık kendi hesabı; yoksa undefined. */
  findAccountId(): Promise<string | undefined>;
  /** Fikir varsa açıklama taslağı (boş olabilir); fikir yoksa undefined. */
  ideaCaption(ideaId: string): Promise<{ caption?: string } | undefined>;
  createJob(input: CreatePublishJobInput): Promise<void>;
  /** true = yeni yazıldı, false = aynı anahtar daha önce yazılmıştı. */
  notify(draft: PublishNoticeDraft & { dedupeKey: string }): Promise<boolean>;
  /**
   * SPN-33: stüdyodan dönen sonucu panel fişine yansıtır (`uretildi` + video / `hata` + not). Panelde karşılığı olmayan sipariş (elle yazılmış
   * fiş) sessizce geçilir; tekrar çağrı zararsızdır. Verilmezse (eski bağlama / testler) fiş durumuna dokunulmaz.
   */
  markPanelOrder?(update: PanelOrderUpdate): Promise<void>;
}

export type PanelOrderUpdate =
  | { orderId: string; status: "uretildi"; video: string; cover?: string }
  | { orderId: string; status: "hata"; errorNote: string };

export type OrderReturnSkip = "invalid_ticket" | "video_missing" | "caption_missing" | "caption_invalid" | "no_account" | "media_outside_root";

export interface OrderReturnResult {
  opened: string[];
  drafts: string[];
  skipped: { orderId: string; reason: OrderReturnSkip; detail?: string }[];
  /** Zaten satırı olan sipariş sayısı (ikinci taramada artar, satır açılmaz). */
  alreadyHandled: number;
}

export interface OrderReturnInput {
  root: string;
  studioSlug: string;
  now: Date;
  store: OrderReturnStore;
  /** Yalnız bu stüdyo sipariş kimliği işlenir (üretimden hemen sonra tek sipariş için); verilmezse klasördeki tüm fişler. */
  onlyOrderId?: string;
}

const WEEK = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ticketFiles(root: string, studioSlug: string): string[] {
  const base = join(root, studioSlug);
  if (!existsSync(base)) return [];
  const files: string[] = [];
  for (const week of readdirSync(base).filter((w) => WEEK.test(w) && statSync(join(base, w)).isDirectory()).sort()) {
    for (const name of readdirSync(join(base, week)).filter((n) => n.endsWith(".md")).sort()) files.push(join(base, week, name));
  }
  return files;
}

export async function returnOrders(input: OrderReturnInput): Promise<OrderReturnResult> {
  const result: OrderReturnResult = { opened: [], drafts: [], skipped: [], alreadyHandled: 0 };
  for (const path of ticketFiles(input.root, input.studioSlug)) {
    let ticket;
    try {
      ticket = readTicket(readFileSync(path, "utf8")).ticket;
    } catch {
      continue; // bozuk fiş başka işin konusu; burada sessizce atlanır (sipariş kimliği bilinmiyor)
    }
    if (ticket.hesap !== input.studioSlug || !ticket.onay) continue;
    if (input.onlyOrderId !== undefined && ticket.siparis_id !== input.onlyOrderId) continue;
    if (await input.store.isSupersededOrder?.(ticket.siparis_id)) {
      if (ticket.durum === "uretildi") result.alreadyHandled += 1; // eski sürüm: satır açılmaz, panel fişine dokunulmaz
      continue;
    }
    if (ticket.durum === "hata") {
      await input.store.markPanelOrder?.({ orderId: ticket.siparis_id, status: "hata", errorNote: ticket.hata_notu ?? "Stüdyo videoyu üretemedi." });
      continue;
    }
    if (ticket.durum !== "uretildi") continue;
    const orderId = ticket.siparis_id;
    const markDone = async () => {
      if (ticket.video !== undefined) await input.store.markPanelOrder?.({ orderId, status: "uretildi", video: ticket.video, ...(ticket.kapak !== undefined ? { cover: ticket.kapak } : {}) });
    };
    if (await input.store.hasJobForOrder(orderId)) {
      await markDone();
      result.alreadyHandled += 1;
      continue;
    }
    const skip = (reason: OrderReturnSkip, detail?: string) => result.skipped.push({ orderId, reason, ...(detail ? { detail } : {}) });
    if (ticket.video === undefined) {
      skip("video_missing");
      continue;
    }
    let mediaPath: string;
    try {
      mediaPath = toOrderMediaPath(input.root, dirname(path), ticket.video, input.studioSlug);
    } catch (e) {
      if (e instanceof OrderMediaError) skip(e.code === "outside_root" ? "media_outside_root" : e.code === "missing" ? "video_missing" : "media_outside_root", e.message);
      else throw e;
      continue;
    }
    const captionFile = join(dirname(path), orderId, "aciklama.txt");
    let caption = existsSync(captionFile) ? readFileSync(captionFile, "utf8").trim() : undefined;
    if (!caption && ticket.fikir_id && UUID.test(ticket.fikir_id)) caption = (await input.store.ideaCaption(ticket.fikir_id))?.caption?.trim();
    if (!caption) {
      skip("caption_missing");
      continue;
    }
    const accountId = await input.store.findAccountId();
    if (!accountId) {
      skip("no_account");
      continue;
    }
    const at = istanbulStampToUtc(ticket.istenen_saat);
    const past = at === undefined || at.getTime() <= input.now.getTime();
    const aiGenerated = isAiGeneratedOrder(ticket.tur);
    const base: CreatePublishJobInput = {
      socialAccountId: accountId,
      caption: aiGenerated ? withAiDisclosure(caption) : caption,
      mediaPath,
      orderId,
      aiGenerated,
      ...(!past && at ? { scheduledFor: at.toISOString() } : {}),
      ...(ticket.fikir_id && UUID.test(ticket.fikir_id) ? { ideaId: ticket.fikir_id } : {}),
    };
    let draft = false;
    try {
      await input.store.createJob({ ...base, status: "awaiting_approval" });
    } catch (e) {
      if (e instanceof RepositoryError && e.code === "already_exists") {
        await markDone();
        result.alreadyHandled += 1;
        continue;
      }
      if (e instanceof ComplianceFailedError) {
        draft = true;
        try {
          await input.store.createJob({ ...base, status: "draft" });
        } catch (e2) {
          if (e2 instanceof RepositoryError && e2.code === "already_exists") {
            await markDone();
            result.alreadyHandled += 1;
            continue;
          }
          throw e2;
        }
      } else if (e instanceof RepositoryError && e.code === "invalid_input") {
        skip("caption_invalid", e.message);
        continue;
      } else throw e;
    }
    const notice = draft
      ? orderDraftNotice({ orderId, problem: AI_DISCLOSURE_PROBLEM_PLAIN })
      : orderReadyNotice({ orderId, ...(past ? { scheduleNote: SCHEDULE_PAST_NOTE_PLAIN } : {}) });
    await input.store.notify({ ...notice, dedupeKey: `order_return:${orderId}` });
    await markDone();
    (draft ? result.drafts : result.opened).push(orderId);
  }
  return result;
}

/** Dönmeyi bekleyen sipariş kimlikleri (yazmadan sayım): `uretildi` + onaylı + videosu yazılmış + `known` içinde olmayan fişler. */
export function listReturnableOrderIds(root: string, studioSlug: string, known: ReadonlySet<string>): string[] {
  const ids: string[] = [];
  for (const path of ticketFiles(root, studioSlug)) {
    try {
      const { ticket } = readTicket(readFileSync(path, "utf8"));
      if (ticket.hesap === studioSlug && ticket.durum === "uretildi" && ticket.onay && ticket.video !== undefined && !known.has(ticket.siparis_id)) ids.push(ticket.siparis_id);
    } catch {
      // bozuk fiş sayıma girmez
    }
  }
  return ids;
}
