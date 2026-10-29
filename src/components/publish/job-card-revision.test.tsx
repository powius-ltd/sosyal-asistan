// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const actionsProps = vi.hoisted(() => ({ last: undefined as Record<string, unknown> | undefined }));
vi.mock("@/components/publish/job-actions", () => ({
  JobActions: (props: Record<string, unknown>) => {
    actionsProps.last = props;
    return null;
  },
}));

import { PublishJobCard } from "@/components/publish/job-card";
import { buildJobViews } from "@/components/publish/job-views";
import type { PublishJob } from "@/lib/domain/publish";
import type { StudioOrder } from "@/lib/domain/studio-order";

const job = (status: PublishJob["status"], orderId = "s1-r2"): PublishJob =>
  ({ id: "j1", workspaceId: "w", socialAccountId: "a1", platform: "instagram", status, caption: "Açıklama", orderId, mediaPath: "siparis:x/final.mp4", shareToFeed: true, paidPartnership: false, aiGenerated: true, attemptCount: 0, createdAt: "2026-10-20T10:00:00.000Z", updatedAt: "2026-10-20T10:00:00.000Z" }) as PublishJob;

const order = (over: Partial<StudioOrder> = {}): StudioOrder =>
  ({ id: "o1", ideaId: "i1", status: "uretildi", revision: 2, revisions: [{ version: 1, orderId: "s1", requestedAt: "2026-10-19T09:00:00.000Z", note: "Açılış daha kısa olsun", video: "s1/final.mp4", publishJobId: "j0" }], ticket: { siparis_id: "s1-r2", video: "s1-r2/final.mp4" }, createdAt: "x", updatedAt: "x", ...over }) as StudioOrder;

const views = (j: PublishJob, o: StudioOrder) => buildJobViews([j], [{ id: "a1", handle: "ornekstudyoapp" }], [], "TR", [o]);

describe("yayın kartı · revize (SPN-36)", () => {
  it("2. sürüm rozeti ve önceki istekler görünür", () => {
    render(<ul><PublishJobCard view={views(job("awaiting_approval"), order())[0]!} timeZone="Europe/Istanbul" /></ul>);
    expect(screen.getByText("2. sürüm")).toBeInTheDocument();
    expect(screen.getByText("Önceki istekler (1)")).toBeInTheDocument();
    expect(screen.getByText("Açılış daha kısa olsun")).toBeInTheDocument();
  });

  it("ilk sürümde rozet ve geçmiş yok", () => {
    const first = order({ revision: 1, revisions: [], ticket: { siparis_id: "s1-r2", video: "v" } as never });
    render(<ul><PublishJobCard view={views(job("awaiting_approval"), first)[0]!} timeZone="Europe/Istanbul" /></ul>);
    expect(screen.queryByText(/sürüm$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Önceki istekler/)).not.toBeInTheDocument();
  });

  it("onay bekleyen + üretilmiş videoda 'Revize iste' verilir (kalan hak ve fiş kimliğiyle)", () => {
    render(<ul><PublishJobCard view={views(job("awaiting_approval"), order())[0]!} timeZone="Europe/Istanbul" /></ul>);
    expect(actionsProps.last?.revise).toEqual({ orderId: "o1", left: 2, jobContext: undefined });
  });

  it("onaylanmış / yayındaki video, hakkı biten video ve fişi olmayan işte düğme verilmez", () => {
    render(<ul><PublishJobCard view={views(job("approved"), order())[0]!} timeZone="Europe/Istanbul" /></ul>);
    expect(actionsProps.last?.revise).toBeUndefined();
    render(<ul><PublishJobCard view={views(job("awaiting_approval"), order({ revision: 4 }))[0]!} timeZone="Europe/Istanbul" /></ul>);
    expect(actionsProps.last?.revise).toBeUndefined();
    render(<ul><PublishJobCard view={views(job("awaiting_approval", "baska-siparis"), order())[0]!} timeZone="Europe/Istanbul" /></ul>);
    expect(actionsProps.last?.revise).toBeUndefined();
  });
});
