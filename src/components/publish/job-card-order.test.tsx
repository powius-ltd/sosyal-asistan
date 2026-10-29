// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublishJobCard } from "@/components/publish/job-card";
import { buildJobViews } from "@/components/publish/job-views";
import type { PublishJob } from "@/lib/domain/publish";

vi.mock("@/components/publish/job-actions", () => ({ JobActions: () => null }));

const job = (mediaPath?: string): PublishJob => ({
  id: "j1", workspaceId: "w", socialAccountId: "a1", platform: "instagram", status: "awaiting_approval", caption: "Açıklama", ...(mediaPath ? { mediaPath } : {}),
  shareToFeed: true, paidPartnership: false, aiGenerated: true, attemptCount: 0, createdAt: "2026-10-20T10:00:00.000Z", updatedAt: "2026-10-20T10:00:00.000Z",
} as PublishJob);

const view = (mediaPath?: string) => buildJobViews([job(mediaPath)], [{ id: "a1", handle: "ornekstudyoapp" }], [], "TR")[0]!;

describe("yayın kartı · stüdyo videosu önizlemesi", () => {
  it("siparis: medyalı satırda video oynatıcı çizilir", () => {
    const { container } = render(<ul><PublishJobCard view={view("siparis:ornek-studyo/2026-10-19/s1/final.mp4")} timeZone="Europe/Istanbul" /></ul>);
    expect(container.querySelector("video")?.getAttribute("src")).toMatch(/^\/api\/siparis-video\//);
  });
  it("normal medyalı satırda oynatıcı yok", () => {
    const { container } = render(<ul><PublishJobCard view={view("publish-media/x.mp4")} timeZone="Europe/Istanbul" /></ul>);
    expect(container.querySelector("video")).toBeNull();
    expect(screen.queryByText(/Stüdyo videosu/)).toBeNull();
  });
});
