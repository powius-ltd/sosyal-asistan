/**
 * "Kopyala ve düzelt" action'ı (Y7): `already_exists` yolunda eski satır iptal edildikten sonra ikinci `create` de düşerse sessiz kalınmaz,
 * durum açıkça söylenir. Depo ve bağlam sahtedir.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPanelContext: vi.fn(),
  revalidatePath: vi.fn(),
  repo: {
    listPublishJobs: vi.fn(),
    listOwnAccounts: vi.fn(),
    getWorkspace: vi.fn(),
    createPublishJob: vi.fn(),
    cancelPublishJob: vi.fn(),
  },
}));

vi.mock("@/lib/data", () => ({ getPanelContext: mocks.getPanelContext }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { replacePublishJob } from "@/app/actions/publish-replace";
import { REPLACE_HALF_DONE_MESSAGE } from "@/components/publish/publish-messages";
import { RepositoryError } from "@/lib/data/repository";

const WS = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-20T09:00:00.000Z");
const input = { replacesJobId: "job-old", job: { socialAccountId: "acc-1", caption: "Düzeltilmiş açıklama #yz", scheduledAt: "", paidPartnership: false, aiGenerated: true, status: "awaiting_approval" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPanelContext.mockResolvedValue({ repo: mocks.repo, wsId: WS, now: NOW });
  mocks.repo.listPublishJobs.mockResolvedValue([{ id: "job-old", status: "failed", orderId: "s1", mediaPath: "siparis:ornek-studyo/2026-10-19/s1/final.mp4" }]);
  mocks.repo.listOwnAccounts.mockResolvedValue([{ id: "acc-1", connection: "connected", platform: "instagram", handle: "ornekstudyoapp" }]);
  mocks.repo.getWorkspace.mockResolvedValue({ timezone: "Europe/Istanbul" });
  mocks.repo.cancelPublishJob.mockResolvedValue(undefined);
});

describe("replacePublishJob · already_exists yolu (Y7)", () => {
  it("ikinci create de düşerse hata açıkça söylenir (başarı dönmez), eski satırın iptali ve yenileme yazılır", async () => {
    mocks.repo.createPublishJob
      .mockRejectedValueOnce(new RepositoryError("already_exists", "etkin satır var"))
      .mockRejectedValueOnce(new Error("db kapalı"));
    const result = await replacePublishJob(input);
    expect(result).toMatchObject({ ok: false, message: REPLACE_HALF_DONE_MESSAGE });
    expect(mocks.repo.cancelPublishJob).toHaveBeenCalledWith(WS, "job-old");
    expect(mocks.repo.createPublishJob).toHaveBeenCalledTimes(2);
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("ikinci create başarılıysa ok", async () => {
    mocks.repo.createPublishJob.mockRejectedValueOnce(new RepositoryError("already_exists", "etkin satır var")).mockResolvedValueOnce(undefined);
    expect(await replacePublishJob(input)).toMatchObject({ ok: true, oldCancelled: true });
  });
});
