/** Fiş action'ları: girdi doğrulama, çalışma alanı bağlamı, hata çevirisi, başarıda yeniden çizim. İş mantığı `create-for-idea.test.ts`'te. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPanelContext: vi.fn(),
  revalidatePath: vi.fn(),
  listWorkspaces: vi.fn(),
  createOrderForIdea: vi.fn(),
  updateOrder: vi.fn(),
}));

vi.mock("@/lib/data", () => ({ getPanelContext: mocks.getPanelContext }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/workspace/registry", () => ({ listWorkspaces: mocks.listWorkspaces }));
vi.mock("@/lib/studio-order/create-for-idea", () => ({ createOrderForIdea: mocks.createOrderForIdea, updateOrder: mocks.updateOrder }));

import { createStudioOrderAction, updateStudioOrderAction } from "@/app/actions/studio-orders";
import { RepositoryError } from "@/lib/data/repository";

const WS = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-20T09:00:00.000Z");
const REPO = { tag: "repo" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPanelContext.mockResolvedValue({ repo: REPO, wsId: WS, now: NOW });
  mocks.listWorkspaces.mockResolvedValue([{ id: WS, name: "Ornek", slug: "ornek", accounts: [] }]);
});

describe("createStudioOrderAction", () => {
  it("geçersiz girdiyi reddeder, depoya gitmez", async () => {
    expect(await createStudioOrderAction("")).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await createStudioOrderAction({})).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await createStudioOrderAction(null)).toMatchObject({ ok: false, code: "invalid_input" });
    expect(mocks.createOrderForIdea).not.toHaveBeenCalled();
  });

  it("başarıda fiş kimliğini döner, slug'ı kayıttan geçirir ve yeniden çizer", async () => {
    mocks.createOrderForIdea.mockResolvedValue({ order: { id: "o1" }, created: true });
    expect(await createStudioOrderAction("idea-1")).toEqual({ ok: true, orderId: "o1", created: true });
    expect(mocks.createOrderForIdea).toHaveBeenCalledWith({ repo: REPO, wsId: WS, now: NOW, ideaId: "idea-1", panelSlug: "ornek" });
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("tür verilirse fiş o türle yazılır; fiş zaten varsa ve türü farklıysa türü değişir", async () => {
    mocks.createOrderForIdea.mockResolvedValue({ order: { id: "o1", ticket: {} }, created: true });
    expect(await createStudioOrderAction({ ideaId: "idea-1", kind: "ugc" })).toEqual({ ok: true, orderId: "o1", created: true });
    expect(mocks.createOrderForIdea).toHaveBeenCalledWith(expect.objectContaining({ ideaId: "idea-1", kind: "ugc" }));
    expect(mocks.updateOrder).not.toHaveBeenCalled();

    mocks.createOrderForIdea.mockResolvedValue({ order: { id: "o2", ticket: { tur: "ugc" } }, created: false });
    mocks.updateOrder.mockResolvedValue({ id: "o2" });
    expect(await createStudioOrderAction({ ideaId: "idea-2", kind: "animasyon" })).toEqual({ ok: true, orderId: "o2", created: false });
    expect(mocks.updateOrder).toHaveBeenCalledWith({ repo: REPO, wsId: WS, now: NOW, orderId: "o2", kind: "animasyon" });
    expect(await createStudioOrderAction({ ideaId: "idea-2", kind: "uzay" })).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("depo hatasını Türkçe mesaja çevirir", async () => {
    mocks.createOrderForIdea.mockRejectedValue(new RepositoryError("not_found", "x"));
    const result = await createStudioOrderAction({ ideaId: "yok" });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateStudioOrderAction", () => {
  it("geçersiz girdiyi (alan yok, bilinmeyen tür, fazla alan) reddeder", async () => {
    expect(await updateStudioOrderAction({ orderId: "o1" })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await updateStudioOrderAction({ orderId: "o1", kind: "uzay" })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await updateStudioOrderAction({ orderId: "o1", kind: "ugc", durum: "uretildi" })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(mocks.updateOrder).not.toHaveBeenCalled();
  });

  it("başarıda türü ve notu iletir", async () => {
    mocks.updateOrder.mockResolvedValue({ id: "o1" });
    expect(await updateStudioOrderAction({ orderId: "o1", kind: "ugc", note: "Not" })).toEqual({ ok: true, orderId: "o1" });
    expect(mocks.updateOrder).toHaveBeenCalledWith({ repo: REPO, wsId: WS, now: NOW, orderId: "o1", kind: "ugc", note: "Not" });
  });

  it("taslak olmayan fişte invalid_state döner", async () => {
    mocks.updateOrder.mockRejectedValue(new RepositoryError("invalid_state", "x"));
    expect(await updateStudioOrderAction({ orderId: "o1", note: "N" })).toMatchObject({ ok: false, code: "invalid_state" });
  });
});
