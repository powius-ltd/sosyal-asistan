/**
 * Fişten paylaşım (`zernio-paylas --siparis <fiş>`): hangi video, hangi açıklama, hangi saat; neden paylaşılamıyor; paylaşınca fişe ne yazılır ve
 * fikir hangi Reels'e bağlanır. Dosya erişimi enjekte edilir (saf test), Zernio çağrısı betikte kalır (gönderim `--onay` ister).
 * Açıklama kaynağı sırası: stüdyonun yazdığı `<siparis_id>/aciklama.txt` (videodaki olgu ve CTA ile tutarlı; SIPARIS.md v2) → fikrin `captionDraft`'ı.
 */
import { dirname, isAbsolute, join } from "node:path";

import type { PanelRepository } from "@/lib/data/repository";
import type { IdeaLink } from "@/lib/domain/outcomes";
import { setFrontmatterFields } from "@/lib/studio-order/frontmatter";
import type { Ticket } from "@/lib/studio-order/schema";
import { readTicket } from "@/lib/studio-order/ticket-file";

export interface PublishFs {
  exists(path: string): boolean;
  read(path: string): string;
}

export interface OrderPublishPlan {
  ticket: Ticket;
  ticketPath: string;
  /** Fişte yazılı video, fişin yanına göre çözülmüş yol; fişte yoksa undefined. */
  videoPath?: string;
  /** Açıklama + hashtag metni; kaynak yoksa undefined. */
  caption?: string;
  captionSource?: "aciklama.txt" | "fikir";
  /** Fişteki İstanbul saati (`YYYY-AA-GG SS:DD`). */
  scheduleStamp: string;
  /** GERÇEK gönderimi durduran sebepler (dry-run bunları yazar ve devam eder). */
  blockers: string[];
  /** Durdurmayan uyarılar. */
  warnings: string[];
}

export interface PlanPublishInput {
  ticketPath: string;
  ticketText: string;
  fs: PublishFs;
  /** Fikrin `captionDraft`'ı (çağıran DB'den okur; yoksa undefined). */
  ideaCaption?: string;
}

const resolveNextTo = (ticketPath: string, value: string): string => (isAbsolute(value) ? value : join(dirname(ticketPath), value));

export function planOrderPublish(input: PlanPublishInput): OrderPublishPlan {
  const { ticket } = readTicket(input.ticketText);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (ticket.durum !== "uretildi") blockers.push(`fişin durumu "${ticket.durum}"; yalnız "uretildi" fiş paylaşılır`);
  if (!ticket.onay) blockers.push('fişte onay: hayir; üretime ve paylaşıma "onay: evet" ile girilir');
  if (ticket.zernio_post_id) blockers.push(`fiş zaten paylaşılmış (zernio_post_id ${ticket.zernio_post_id}); ikinci gönderim yapılmaz`);

  let videoPath: string | undefined;
  if (ticket.video === undefined) blockers.push("fişte video yok (stüdyo henüz yazmadı)");
  else {
    videoPath = resolveNextTo(input.ticketPath, ticket.video);
    if (!input.fs.exists(videoPath)) blockers.push(`video dosyası yok: ${videoPath}`);
  }

  let caption: string | undefined;
  let captionSource: OrderPublishPlan["captionSource"];
  const captionFile = join(dirname(input.ticketPath), ticket.siparis_id, "aciklama.txt");
  if (input.fs.exists(captionFile)) {
    caption = input.fs.read(captionFile).trim();
    captionSource = "aciklama.txt";
  } else if (input.ideaCaption?.trim()) {
    caption = input.ideaCaption.trim();
    captionSource = "fikir";
  }
  if (!caption) blockers.push(`açıklama yok: ${captionFile} bulunamadı ve fikrin açıklama taslağı okunamadı`);
  else if (ticket.cta && !caption.toLocaleLowerCase("tr-TR").includes(ticket.cta.toLocaleLowerCase("tr-TR"))) {
    warnings.push(`açıklamada CTA kelimesi "${ticket.cta}" geçmiyor; kural (ManyChat) yayından önce açık olmalı`);
  }

  return {
    ticket,
    ticketPath: input.ticketPath,
    ...(videoPath ? { videoPath } : {}),
    ...(caption ? { caption } : {}),
    ...(captionSource ? { captionSource } : {}),
    scheduleStamp: ticket.istenen_saat,
    blockers,
    warnings,
  };
}

/** Paylaşım bittiğinde fişe yazılacak alanlar (panelin yazabildiği üçü + durum). Zamanlı gönderide yayın adresi henüz yoktur. */
export function publishedFields(postId: string, publicUrl: string | undefined): Record<string, string> {
  return { durum: "paylasildi", zernio_post_id: postId, ...(publicUrl ? { yayin_url: publicUrl } : {}) };
}

export function markTicketPublished(ticketText: string, postId: string, publicUrl: string | undefined): string {
  return setFrontmatterFields(ticketText, publishedFields(postId, publicUrl));
}

export type LinkOutcome =
  | { kind: "linked"; link: IdeaLink }
  | { kind: "skipped"; reason: string };

/**
 * Fikri yayınlanan Reels'e bağlar (`linkIdeaToReel`: kısa kod platform modülünden). Kısa kod toplanmış kendi içerikle eşleşirse bağ
 * `confirmed`, eşleşmezse `awaiting_content` (sonraki toplamada çözülür). Fikir kimliği ya da yayın adresi yoksa bağ kurulmaz, sebebi söylenir.
 */
export async function linkPublishedOrder(repo: Pick<PanelRepository, "linkIdeaToReel">, workspaceId: string, ticket: Ticket, publicUrl: string | undefined): Promise<LinkOutcome> {
  if (!ticket.fikir_id || ticket.fikir_id === "mock") {
    return { kind: "skipped", reason: "fişte panel fikir kimliği yok (elle fiş); bağ kurulmadı" };
  }
  if (!publicUrl) return { kind: "skipped", reason: "yayın adresi henüz yok (zamanlı gönderi); yayınlanınca yayin_url yazılıp --bagla ile bağlanır" };
  return { kind: "linked", link: await repo.linkIdeaToReel(workspaceId, { ideaId: ticket.fikir_id, url: publicUrl }) };
}
