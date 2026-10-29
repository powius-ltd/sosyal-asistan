// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildJobViews } from "@/components/publish/job-views";
import { VideoList } from "@/components/publish/video-list";
import type { PublishJob } from "@/lib/domain/publish";
import { videoFilterCounts } from "@/lib/publish/video-status";

vi.mock("@/components/publish/job-card", () => ({
  PublishJobCard: ({ view }: { view: { job: { id: string } } }) => <li data-testid="kart">{view.job.id}</li>,
}));

const job = (id: string, status: PublishJob["status"]) =>
  ({ id, status, socialAccountId: "a1", platform: "instagram", paidPartnership: false, aiGenerated: false, attemptCount: 0, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }) as unknown as PublishJob;

const jobs = [job("j1", "awaiting_approval"), job("j2", "approved"), job("j3", "published")];
const views = buildJobViews(jobs, [{ id: "a1", handle: "x" }], [], "TR");
const counts = videoFilterCounts(jobs, 1);

describe("VideoList", () => {
  it("4 süzgeç sayılarıyla çizilir; yalnız seçili durumun kartları görünür", () => {
    render(<VideoList filter="onay" counts={counts} views={views} preparing={[{ orderId: "o1", title: "Kahve videosu" }]} timeZone="Europe/Istanbul" />);
    expect(screen.getByRole("link", { name: /Onay bekliyor 1/ }).getAttribute("href")).toBe("/yayin?durum=onay");
    expect(screen.getByRole("link", { name: /Hazırlanıyor 1/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Zamanlandı 1/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Paylaşıldı 1/ })).toBeTruthy();
    expect(screen.getAllByTestId("kart").map((el) => el.textContent)).toEqual(["j1"]);
  });

  it("hazırlanıyor: yalnız başlık ve 'stüdyoda'; boş süzgeçte açıklama", () => {
    const { rerender } = render(<VideoList filter="hazirlaniyor" counts={counts} views={views} preparing={[{ orderId: "o1", title: "Kahve videosu" }]} timeZone="Europe/Istanbul" />);
    expect(screen.getByText("Kahve videosu")).toBeTruthy();
    expect(screen.getByText("stüdyoda")).toBeTruthy();
    expect(screen.queryByTestId("kart")).toBeNull();
    rerender(<VideoList filter="paylasildi" counts={counts} views={[]} preparing={[]} timeZone="Europe/Istanbul" />);
    expect(screen.getByText(/Henüz paylaşılan video yok/)).toBeTruthy();
  });
});
