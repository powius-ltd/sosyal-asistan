import { describe, expect, it } from "vitest";

import type { PublishStatus } from "@/lib/domain/publish";
import type { StudioOrder } from "@/lib/domain/studio-order";
import { parseVideoFilter, preparingVideos, videoFilterCounts, videoFilterOfJob } from "@/lib/publish/video-status";
import { isBackstageVisible } from "@/lib/workspace/backstage";

const job = (status: PublishStatus, orderId?: string) => ({ status, orderId });
const order = (id: string, slot: string, status: string, konu?: string) =>
  ({ id, ideaId: `idea-${id}`, status, ticket: { siparis_id: slot, konu, sutun: "sütun" } }) as unknown as StudioOrder;

describe("video durumu", () => {
  it("iş durumlarını 4 süzgece eşler; iptal listede yok; başarısız zamanlandı'da", () => {
    expect(videoFilterOfJob(job("draft"))).toBe("onay");
    expect(videoFilterOfJob(job("awaiting_approval"))).toBe("onay");
    for (const s of ["approved", "container_pending", "ready", "publishing", "failed", "expired"] as const) expect(videoFilterOfJob(job(s))).toBe("zamanlandi");
    expect(videoFilterOfJob(job("published"))).toBe("paylasildi");
    expect(videoFilterOfJob(job("cancelled"))).toBeUndefined();
  });

  it("süzgeç parametresi: geçersiz / yok → onay bekliyor", () => {
    expect(parseVideoFilter(undefined)).toBe("onay");
    expect(parseVideoFilter("x")).toBe("onay");
    expect(parseVideoFilter("zamanlandi")).toBe("zamanlandi");
    expect(parseVideoFilter(["paylasildi", "onay"])).toBe("paylasildi");
  });

  it("hazırlanıyor = yayın işi olmayan etkin fiş; hata fişi ve işi olan fiş sayılmaz", () => {
    const orders = [order("1", "s1", "bekliyor", "Konu A"), order("2", "s2", "hata"), order("3", "s3", "uretildi")];
    const rows = preparingVideos(orders, [job("awaiting_approval", "s3")], (id) => (id === "idea-1" ? undefined : "Fikir"));
    expect(rows).toEqual([{ orderId: "1", title: "Konu A" }]);
  });

  it("sayılar süzgeç başına", () => {
    const counts = videoFilterCounts([job("draft"), job("awaiting_approval"), job("approved"), job("published"), job("cancelled")], 2);
    expect(counts).toEqual({ onay: 2, hazirlaniyor: 2, zamanlandi: 1, paylasildi: 1 });
  });
});

describe("isBackstageVisible", () => {
  it("müşteri kopyasında ve barındırmada kapalı, yerel yöneticide açık", () => {
    expect(isBackstageVisible({})).toBe(true);
    expect(isBackstageVisible({ PANEL_EDITION: "kopya" })).toBe(false);
    expect(isBackstageVisible({ VERCEL: "1" })).toBe(false);
  });
});
