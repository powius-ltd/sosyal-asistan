// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requestJobAction: vi.fn(), cancelJobAction: vi.fn(), fetch: vi.fn() }));
vi.mock("@/app/actions/jobs", () => ({ requestJobAction: mocks.requestJobAction, cancelJobAction: mocks.cancelJobAction }));

import { contextOf } from "@/components/jobs/job-fixtures";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import { ProduceButton } from "@/components/studio-order/produce-button";

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

describe("ProduceButton", () => {
  it("basınca iş BAŞLAMAZ: kapsam penceresi açılır (video üretilir, paylaşmadan önce onay istenir)", async () => {
    const user = userEvent.setup();
    render(<ProduceButton orderId={ORDER_ID} context={contextOf()} />);
    await user.click(screen.getByRole("button", { name: "Üretime gönder" }));
    expect(mocks.requestJobAction).not.toHaveBeenCalled();
    expect(await screen.findByText(/paylaşmadan önce yine senin onayını isteriz/)).toBeInTheDocument();
  });

  it("'Onayla ve üret' produce işini fiş kimliği + tek seferlik tutar onayıyla yazar", async () => {
    const user = userEvent.setup();
    mocks.requestJobAction.mockResolvedValueOnce({ ok: true, jobId: "job_produce" });
    render(<ProduceButton orderId={ORDER_ID} context={contextOf()} />);
    await user.click(screen.getByRole("button", { name: "Üretime gönder" }));
    await user.click(await screen.findByRole("button", { name: "Onayla ve üret" }));
    expect(mocks.requestJobAction).toHaveBeenCalledExactlyOnceWith({ kind: "produce", orderId: ORDER_ID, approval: { basis: "one_time", maxUsd: 0.5 } });
  });

  it("geçersiz tutar gönderilmez, hata yazılır", async () => {
    const user = userEvent.setup();
    render(<ProduceButton orderId={ORDER_ID} context={contextOf()} />);
    await user.click(screen.getByRole("button", { name: "Üretime gönder" }));
    const input = await screen.findByLabelText("En çok harcanacak tutar (USD)");
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: "Onayla ve üret" }));
    expect(mocks.requestJobAction).not.toHaveBeenCalled();
    expect(await screen.findByText("Tutar 0'dan büyük olmalı.")).toBeInTheDocument();
  });

  it("sunucu reddederse (ör. anlatım türü) düz cümle pencerede görünür, pencere kapanmaz", async () => {
    const user = userEvent.setup();
    mocks.requestJobAction.mockResolvedValueOnce({ ok: false, code: "invalid_state", message: "Anlatımlı videolar bu adımda üretilmiyor; şimdilik başka bir türle dene." });
    render(<ProduceButton orderId={ORDER_ID} context={contextOf()} />);
    await user.click(screen.getByRole("button", { name: "Üretime gönder" }));
    await user.click(await screen.findByRole("button", { name: "Onayla ve üret" }));
    expect((await screen.findAllByText(/Anlatımlı videolar bu adımda üretilmiyor/)).length).toBeGreaterThan(0);
  });

  it("harcama bilgisi okunamadıysa düğme kapalı, nedeni yazılı", () => {
    render(<ProduceButton orderId={ORDER_ID} context={contextOf({ spend: false })} />);
    expect(screen.getByRole("button", { name: "Üretime gönder" })).toBeDisabled();
    expect(screen.getByText("Harcama bilgisini okuyamadım; üretim şu an başlatılamıyor.")).toBeInTheDocument();
  });
});
