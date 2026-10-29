/**
 * "Videolar" ekranının 4 durumu (SAF; TEK eşleme yeri). İş durumu → süzgeç:
 *   onay bekliyor = taslak / onay bekliyor · zamanlandı = onaylandı … yayınlanıyor (+ başarısız / süresi dolmuş: rozetle burada kalır)
 *   paylaşıldı = yayınlandı · iptal edilen iş listede yok · hazırlanıyor = yayın işi henüz açılmamış etkin stüdyo fişi.
 */
import type { PublishJob, PublishStatus } from "@/lib/domain/publish";
import { isActiveOrderStatus, type StudioOrder } from "@/lib/domain/studio-order";

export type VideoFilter = "onay" | "hazirlaniyor" | "zamanlandi" | "paylasildi";

export const VIDEO_FILTERS: readonly VideoFilter[] = ["onay", "hazirlaniyor", "zamanlandi", "paylasildi"];

export const VIDEO_FILTER_LABEL: Record<VideoFilter, string> = {
  onay: "Onay bekliyor",
  hazirlaniyor: "Hazırlanıyor",
  zamanlandi: "Zamanlandı",
  paylasildi: "Paylaşıldı",
};

export const DEFAULT_VIDEO_FILTER: VideoFilter = "onay";

export function parseVideoFilter(value: string | string[] | undefined): VideoFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return VIDEO_FILTERS.find((f) => f === raw) ?? DEFAULT_VIDEO_FILTER;
}

const FILTER_OF_STATUS: Record<PublishStatus, VideoFilter | undefined> = {
  draft: "onay",
  awaiting_approval: "onay",
  approved: "zamanlandi",
  container_pending: "zamanlandi",
  ready: "zamanlandi",
  publishing: "zamanlandi",
  failed: "zamanlandi",
  expired: "zamanlandi",
  published: "paylasildi",
  cancelled: undefined,
};

export function videoFilterOfJob(job: Pick<PublishJob, "status">): VideoFilter | undefined {
  return FILTER_OF_STATUS[job.status];
}

/** Hazırlanıyor kartı: yayın işi olmayan etkin fiş (yalnız başlık). */
export interface PreparingVideo {
  orderId: string;
  title: string;
}

/** Yayın işine bağlanmamış etkin fişler; başlık fikir başlığı, yoksa fişin konusu / sütunu. */
export function preparingVideos(
  orders: readonly StudioOrder[],
  jobs: readonly Pick<PublishJob, "orderId">[],
  ideaTitleOf: (ideaId: string) => string | undefined,
): PreparingVideo[] {
  const withJob = new Set(jobs.flatMap((j) => (j.orderId === undefined ? [] : [j.orderId])));
  return orders
    .filter((o) => isActiveOrderStatus(o.status) && !withJob.has(o.ticket.siparis_id))
    .map((o) => ({ orderId: o.id, title: ideaTitleOf(o.ideaId) ?? o.ticket.konu ?? o.ticket.sutun }));
}

export type VideoFilterCounts = Record<VideoFilter, number>;

export function videoFilterCounts(jobs: readonly Pick<PublishJob, "status">[], preparing: number): VideoFilterCounts {
  const counts: VideoFilterCounts = { onay: 0, hazirlaniyor: preparing, zamanlandi: 0, paylasildi: 0 };
  for (const job of jobs) {
    const filter = videoFilterOfJob(job);
    if (filter !== undefined) counts[filter] += 1;
  }
  return counts;
}
