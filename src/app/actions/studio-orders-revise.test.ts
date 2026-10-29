import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

import { requestOrderRevisionAction } from "@/app/actions/studio-orders";
import { getPanelContext } from "@/lib/data";
import { ORDER_REVISION_NOTE_MAX } from "@/lib/domain/studio-order";

beforeEach(() => revalidatePath.mockClear());

/** Üretilmiş + yayın onayı bekleyen bir video kurar (mock depo; kendi fikri, kendi fişi). */
async function producedOrder(suffix: string) {
  const { repo, wsId, now } = await getPanelContext();
  const account = (await repo.listOwnAccounts(wsId)).find((a) => a.connection === "connected");
  if (!account) throw new Error("Testte kullanılacak bağlı hesap yok (mock veri).");
  const idea = await repo.createManualIdea(wsId, { title: `Revize eylem fikri ${suffix}`, note: "Test." }, now);
  const siparisId = `revize-eylem-${suffix}`;
  const order = await repo.createStudioOrder(
    wsId,
    { ideaId: idea.id, ticket: { siparis_id: siparisId, fikir_id: idea.id, plan_hafta: "2026-10-26", hesap: "test", mod: "konu", sutun: "Test", istenen_saat: "2026-10-30 18:00", onay: false, durum: "taslak", konu: "Konu", ana_hat: ["a", "b"] } as never },
    now,
  );
  await repo.advanceStudioOrder(wsId, order.id, { status: "uretiliyor" }, now);
  await repo.advanceStudioOrder(wsId, order.id, { status: "uretildi", video: `${siparisId}/final.mp4` }, now);
  await repo.createPublishJob(wsId, { socialAccountId: account.id, caption: "Açıklama", orderId: siparisId, status: "awaiting_approval" });
  return { repo, wsId, order, siparisId };
}

describe("requestOrderRevisionAction", () => {
  it("geçerli not: sürüm 2, fiş taslak, eski yayın iptal; ekran yenilenir", async () => {
    const { repo, wsId, order, siparisId } = await producedOrder("a");
    const result = await requestOrderRevisionAction({ orderId: order.id, note: "  Açılış   daha kısa olsun " });
    expect(result).toEqual({ ok: true, orderId: order.id, revision: 2 });
    const after = await repo.getStudioOrder(wsId, order.id);
    expect(after).toMatchObject({ status: "taslak", revision: 2, ticket: { siparis_id: `${siparisId}-r2`, revize_notu: "Açılış daha kısa olsun" } });
    expect((await repo.listPublishJobs(wsId, { status: "cancelled" })).some((j) => j.orderId === siparisId)).toBe(true);
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("ikinci istek (fiş artık taslak): depo nedeni Türkçe söyler", async () => {
    const { order } = await producedOrder("b");
    expect((await requestOrderRevisionAction({ orderId: order.id, note: "Bir" })).ok).toBe(true);
    const second = await requestOrderRevisionAction({ orderId: order.id, note: "İki" });
    expect(second).toMatchObject({ ok: false, code: "invalid_state" });
    if (!second.ok) expect(second.message).toMatch(/henüz üretilmedi/);
  });

  it("geçersiz girdi reddedilir: boş / uzun not, eksik fiş, bilinmeyen alan", async () => {
    const { order } = await producedOrder("c");
    expect(await requestOrderRevisionAction({ orderId: order.id, note: "   " })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await requestOrderRevisionAction({ orderId: order.id, note: "x".repeat(ORDER_REVISION_NOTE_MAX + 1) })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await requestOrderRevisionAction({ note: "Not" })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await requestOrderRevisionAction({ orderId: order.id, note: "Not", workspaceId: "baska" })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await requestOrderRevisionAction("saçma")).toMatchObject({ ok: false });
  });

  it("olmayan fiş: bulunamadı mesajı", async () => {
    const result = await requestOrderRevisionAction({ orderId: "yok-boyle-fis", note: "Not" });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });
});
