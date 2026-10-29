// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revise: vi.fn(), requestJobAction: vi.fn(), cancelJobAction: vi.fn(), fetch: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock("@/app/actions/studio-orders", () => ({ requestOrderRevisionAction: mocks.revise }));
vi.mock("@/app/actions/jobs", () => ({ requestJobAction: mocks.requestJobAction, cancelJobAction: mocks.cancelJobAction }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, warning: mocks.warning, error: vi.fn() } }));

import { contextOf } from "@/components/jobs/job-fixtures";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import { ReviseButton } from "@/components/studio-order/revise-button";

const ORDER_ID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ workerNeeded: false }) });
  vi.stubGlobal("fetch", mocks.fetch);
  jobStatusStore.reset();
});
afterEach(() => {
  jobStatusStore.reset();
  vi.unstubAllGlobals();
});

async function openAndType(note: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Revize iste" }));
  if (note) await user.type(await screen.findByLabelText("Revize notu"), note);
  return user;
}

describe("ReviseButton · işler kapalı (yalnız not kaydedilir)", () => {
  it("pencere kapsamı söyler: metin değişmez, metin için Asistan'a git; kalan hak yazılı", async () => {
    render(<ReviseButton orderId={ORDER_ID} left={2} />);
    await openAndType("");
    expect(await screen.findByText(/Metni değiştirmek istersen önce Asistan'a fikri düzelt de/)).toBeInTheDocument();
    expect(screen.getByText("Bu videoya 2 revize hakkın kaldı.")).toBeInTheDocument();
    expect(screen.getByText(/üretim buradan başlatılamıyor/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revize notunu kaydet" })).toBeInTheDocument();
  });

  it("boş not gönderilmez", async () => {
    render(<ReviseButton orderId={ORDER_ID} left={3} />);
    const user = await openAndType("");
    await user.click(screen.getByRole("button", { name: "Revize notunu kaydet" }));
    expect(await screen.findByText("Revize notunu yaz.")).toBeInTheDocument();
    expect(mocks.revise).not.toHaveBeenCalled();
  });

  it("not kaydedilir, üretim isteği YOK, ekran bunu söyler", async () => {
    mocks.revise.mockResolvedValueOnce({ ok: true, orderId: ORDER_ID, revision: 2 });
    render(<ReviseButton orderId={ORDER_ID} left={3} />);
    const user = await openAndType("Açılış daha kısa olsun");
    await user.click(screen.getByRole("button", { name: "Revize notunu kaydet" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.revise).toHaveBeenCalledExactlyOnceWith({ orderId: ORDER_ID, note: "Açılış daha kısa olsun" });
    expect(mocks.requestJobAction).not.toHaveBeenCalled();
    expect(String(mocks.success.mock.calls[0]?.[0])).toContain("Video şimdi üretilmiyor");
  });

  it("depo reddederse (ör. onaylanmış video) neden pencerede görünür, üretim istenmez", async () => {
    mocks.revise.mockResolvedValueOnce({ ok: false, code: "invalid_state", message: "Bu video artık onay beklemiyor (onaylanmış, planlanmış ya da paylaşılmış); revize istenemez." });
    render(<ReviseButton orderId={ORDER_ID} left={3} jobContext={contextOf()} />);
    const user = await openAndType("Not");
    await user.click(screen.getByRole("button", { name: "Videoyu yeniden üret" }));
    expect(await screen.findByText(/artık onay beklemiyor/)).toBeInTheDocument();
    expect(mocks.requestJobAction).not.toHaveBeenCalled();
  });
});

describe("ReviseButton · işler açık (aynı pencereden yeniden üretim)", () => {
  it("önce revize kaydedilir, sonra produce işi fiş kimliği + tek seferlik tutar onayıyla yazılır", async () => {
    mocks.revise.mockResolvedValueOnce({ ok: true, orderId: ORDER_ID, revision: 2 });
    mocks.requestJobAction.mockResolvedValueOnce({ ok: true, jobId: "job_rev" });
    render(<ReviseButton orderId={ORDER_ID} left={3} jobContext={contextOf()} />);
    const user = await openAndType("Sondaki yazı yanlış");
    expect(screen.getByLabelText("En çok harcanacak tutar (USD)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Videoyu yeniden üret" }));
    await waitFor(() => expect(mocks.requestJobAction).toHaveBeenCalled());
    expect(mocks.revise).toHaveBeenCalledExactlyOnceWith({ orderId: ORDER_ID, note: "Sondaki yazı yanlış" });
    expect(mocks.requestJobAction).toHaveBeenCalledExactlyOnceWith({ kind: "produce", orderId: ORDER_ID, approval: { basis: "one_time", maxUsd: 0.5 } });
    expect(mocks.revise.mock.invocationCallOrder[0]!).toBeLessThan(mocks.requestJobAction.mock.invocationCallOrder[0]!);
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Revize isteğin alındı; video yeniden üretiliyor."));
  });

  it("üretim isteği reddedilirse not yine kaydedilmiştir ve uyarı bunu söyler", async () => {
    mocks.revise.mockResolvedValueOnce({ ok: true, orderId: ORDER_ID, revision: 2 });
    mocks.requestJobAction.mockResolvedValueOnce({ ok: false, code: "invalid_state", message: "Şu an başka bir iş sürüyor." });
    render(<ReviseButton orderId={ORDER_ID} left={3} jobContext={contextOf()} />);
    const user = await openAndType("Not");
    await user.click(screen.getByRole("button", { name: "Videoyu yeniden üret" }));
    await waitFor(() => expect(mocks.warning).toHaveBeenCalled());
    expect(String(mocks.warning.mock.calls[0]?.[0])).toContain("Revize notun kaydedildi ama üretim başlamadı");
  });

  it("geçersiz tutarda hiçbir şey kaydedilmez", async () => {
    render(<ReviseButton orderId={ORDER_ID} left={3} jobContext={contextOf()} />);
    const user = await openAndType("Not");
    const amount = screen.getByLabelText("En çok harcanacak tutar (USD)");
    await user.clear(amount);
    await user.type(amount, "0");
    await user.click(screen.getByRole("button", { name: "Videoyu yeniden üret" }));
    expect(await screen.findByText("Tutar 0'dan büyük olmalı.")).toBeInTheDocument();
    expect(mocks.revise).not.toHaveBeenCalled();
  });

  it("harcama bilgisi okunamadıysa yalnız not kaydedilir", async () => {
    render(<ReviseButton orderId={ORDER_ID} left={3} jobContext={contextOf({ spend: false })} />);
    await openAndType("");
    expect(await screen.findByRole("button", { name: "Revize notunu kaydet" })).toBeInTheDocument();
  });
});
