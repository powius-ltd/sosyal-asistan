/**
 * Sözleşme parçası: video revizesi (`requestOrderRevision`, SPN-36). Test kendi (elle) fikrini, fişini ve yayın satırlarını açar; işi bitince yayın
 * satırlarını iptal eder, fikri `dismissed` yapar (fiş silme yolu yoktur; fişler test çalışma alanında kalır). Üretimi stüdyo yapar: video sonucu
 * `advanceStudioOrder` ile yazılır (dönüş işinin yaptığı gibi).
 */
import { expect, it } from "vitest";

import { cancelJobs, expectCode, expectJobsCancelled, MISSING_ID, type ContractContext } from "@/lib/data/contract/support";
import type { PanelRepository } from "@/lib/data/repository";
import { ORDER_REVISION_MAX, ORDER_REVISION_NOTE_MAX, type StudioOrder } from "@/lib/domain/studio-order";

function ticketFor(ideaId: string) {
  return {
    siparis_id: `sozlesme-rev-${ideaId.slice(0, 8)}`,
    fikir_id: ideaId,
    plan_hafta: "2026-10-26",
    hesap: "sozlesme-hesabi",
    mod: "konu",
    sutun: "Sözleşme",
    istenen_saat: "2026-10-28 18:00",
    onay: false,
    durum: "taslak",
    konu: "Revize konusu",
    ana_hat: ["Açılış", "Gelişme"],
  } as never;
}

export function orderRevisionContract(ctx: ContractContext): void {
  const { wsId, create } = ctx;

  /** Fişi `uretildi` yapar (stüdyo dönüşü) ve o sürüm için onay bekleyen yayın satırı açar. */
  async function produce(r: PanelRepository, order: StudioOrder, accountId: string, jobs: string[], status: "awaiting_approval" | "draft" = "awaiting_approval"): Promise<{ order: StudioOrder; jobId: string }> {
    const now = new Date();
    if (order.status === "taslak") await r.advanceStudioOrder(wsId, order.id, { status: "uretiliyor" }, now);
    const done = await r.advanceStudioOrder(wsId, order.id, { status: "uretildi", video: `${order.ticket.siparis_id}/final.mp4`, cover: `${order.ticket.siparis_id}/kapak.jpg` }, now);
    const job = await r.createPublishJob(wsId, { socialAccountId: accountId, caption: "Revize sözleşme açıklaması", orderId: done.ticket.siparis_id, status });
    jobs.push(job.id);
    return { order: done, jobId: job.id };
  }

  it("revize: üretilmiş + onay bekleyen videoya not yazılır; eski yayın iptal, sürüm 2, fiş taslak, eski sürüm saklanır; 3 revizeden sonra reddedilir", async () => {
    const r = create();
    const now = new Date();
    const account = (await r.listOwnAccounts(wsId)).find((a) => a.connection === "connected");
    if (!account) throw new Error("seed: bağlı hesap yok");
    const ideaId = (await r.createManualIdea(wsId, { title: "Revize sözleşme fikri", note: "Revize için." }, now)).id;
    const jobs: string[] = [];
    try {
      const draft = await r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId) }, now);
      expect(draft).toMatchObject({ revision: 1, revisions: [] });
      const baseId = draft.ticket.siparis_id;

      // Üretilmemiş fişte revize yok; kimlik / not / çalışma alanı hataları.
      await expectCode(r.requestOrderRevision(wsId, draft.id, "Açılış kısa olsun", now), "invalid_state");
      await expectCode(r.requestOrderRevision(wsId, MISSING_ID, "Açılış kısa olsun", now), "not_found");
      await expectCode(r.requestOrderRevision(MISSING_ID, draft.id, "Açılış kısa olsun", now), "not_found");
      await expectCode(r.requestOrderRevision(wsId, draft.id, "   ", now), "invalid_input");
      await expectCode(r.requestOrderRevision(wsId, draft.id, "x".repeat(ORDER_REVISION_NOTE_MAX + 1), now), "invalid_input");

      // Üretildi ama yayın satırı yok → revize yok.
      await r.advanceStudioOrder(wsId, draft.id, { status: "uretiliyor" }, now);
      await r.advanceStudioOrder(wsId, draft.id, { status: "uretildi", video: `${baseId}/final.mp4` }, now);
      await expectCode(r.requestOrderRevision(wsId, draft.id, "Açılış kısa olsun", now), "invalid_state");
      const first = (await r.createPublishJob(wsId, { socialAccountId: account.id, caption: "Revize sözleşme açıklaması", orderId: baseId, status: "awaiting_approval" })).id;
      jobs.push(first);

      // 1. revize: not, iptal, sürüm, kimlik eki, geçmiş.
      const rev2 = await r.requestOrderRevision(wsId, draft.id, "  Açılış\n daha   kısa olsun  ", new Date("2026-10-29T10:00:00.000Z"));
      expect(rev2).toMatchObject({ status: "taslak", revision: 2 });
      expect(rev2.ticket).toMatchObject({ durum: "taslak", onay: false, siparis_id: `${baseId}-r2`, revize_notu: "Açılış daha kısa olsun", onceki_video: `${baseId}/final.mp4` });
      expect(rev2.ticket.video).toBeUndefined();
      expect(rev2.revisions).toEqual([{ version: 1, orderId: baseId, requestedAt: "2026-10-29T10:00:00.000Z", note: "Açılış daha kısa olsun", video: `${baseId}/final.mp4`, publishJobId: first }]);
      expect((await r.getStudioOrder(wsId, draft.id))?.revision).toBe(2);
      expect((await r.listPublishJobs(wsId, { status: "cancelled" })).some((j) => j.id === first)).toBe(true);
      // Fiş taslakta: aynı anda ikinci revize yok.
      await expectCode(r.requestOrderRevision(wsId, draft.id, "Bir daha", now), "invalid_state");

      // 2. ve 3. revize; sürüm kimliği her seferinde tabana eklenir (`-r3` değil `-r2-r3` olmaz).
      await produce(r, rev2, account.id, jobs, "draft");
      const rev3 = await r.requestOrderRevision(wsId, draft.id, "Sondaki yazı yanlış", now);
      expect(rev3.ticket.siparis_id).toBe(`${baseId}-r3`);
      expect(rev3.revisions.map((e) => e.orderId)).toEqual([baseId, `${baseId}-r2`]);
      expect(rev3.revisions[1]).toMatchObject({ version: 2, note: "Sondaki yazı yanlış" });
      await produce(r, rev3, account.id, jobs);
      const rev4 = await r.requestOrderRevision(wsId, draft.id, "Müzik kısılsın", now);
      expect(rev4).toMatchObject({ revision: ORDER_REVISION_MAX + 1, status: "taslak" });
      expect(rev4.ticket.siparis_id).toBe(`${baseId}-r4`);
      const last = (await produce(r, rev4, account.id, jobs)).order;
      expect(last.revision).toBe(4);
      await expectCode(r.requestOrderRevision(wsId, draft.id, "Dördüncü revize", now), "invalid_state");
      expect((await r.getStudioOrder(wsId, draft.id))?.revision).toBe(4);
    } finally {
      await cancelJobs(r, wsId, jobs);
      await expectJobsCancelled(r, wsId, jobs);
      await r.updateIdeaStatus(wsId, ideaId, "dismissed");
    }
  });

  it("revize: onaylanmış (planlanmış / yayına giden) video revize edilemez; fiş ve yayın satırı değişmez", async () => {
    const r = create();
    const now = new Date();
    const account = (await r.listOwnAccounts(wsId)).find((a) => a.connection === "connected");
    if (!account) throw new Error("seed: bağlı hesap yok");
    const ideaId = (await r.createManualIdea(wsId, { title: "Revize sözleşme fikri 2", note: "Onaylı video." }, now)).id;
    const jobs: string[] = [];
    try {
      const order = await r.createStudioOrder(wsId, { ideaId, ticket: ticketFor(ideaId) }, now);
      const { jobId } = await produce(r, order, account.id, jobs);
      const approved = await r.approvePublishJob(wsId, jobId);
      expect(approved.status).toBe("approved");
      await expectCode(r.requestOrderRevision(wsId, order.id, "Artık geç", now), "invalid_state");
      const after = await r.getStudioOrder(wsId, order.id);
      expect(after).toMatchObject({ revision: 1, status: "uretildi" });
      expect(after?.revisions).toEqual([]);
      expect((await r.listPublishJobs(wsId, { status: "approved" })).some((j) => j.id === jobId)).toBe(true);
    } finally {
      await cancelJobs(r, wsId, jobs);
      await r.updateIdeaStatus(wsId, ideaId, "dismissed");
    }
  });
}
