// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadJobsState: vi.fn(), loadJobRunContext: vi.fn() }));
vi.mock("@/components/jobs/jobs-state", () => ({ loadJobsState: mocks.loadJobsState, loadJobRunContext: mocks.loadJobRunContext }));
vi.mock("@/components/studio-order/produce-button", () => ({ ProduceButton: () => <button type="button">Üretime gönder</button> }));

import { ProduceAction } from "@/components/studio-order/produce-action";
import { PRODUCE_COPY } from "@/lib/copy/studio-order";
import type { StudioOrder } from "@/lib/domain/studio-order";
import { ORDER_SEND_PROBLEM_PLAIN } from "@/lib/plain-language-order";

const orderOf = (over: { status?: string; tur?: string }) =>
  ({ id: "o1", status: over.status ?? "taslak", ticket: { tur: over.tur ?? "broll", mod: "senaryo" } }) as unknown as StudioOrder;

async function draw(order: StudioOrder, slug = "ornekstudyoapp") {
  const node = await ProduceAction({ order, panelSlug: slug });
  return render(<>{node}</>);
}

beforeEach(() => {
  mocks.loadJobsState.mockReset().mockResolvedValue({ canRun: true });
  mocks.loadJobRunContext.mockReset().mockResolvedValue({ seed: {}, spend: undefined });
});

describe("ProduceAction", () => {
  it("gönderilebilir taslakta düğmeyi çizer", async () => {
    await draw(orderOf({}));
    expect(screen.getByRole("button", { name: "Üretime gönder" })).toBeInTheDocument();
  });
  it("üretimi yarıda kalan fişte düğme + yeniden deneme notu", async () => {
    await draw(orderOf({ status: "uretiliyor" }));
    expect(screen.getByText(PRODUCE_COPY.retryHint)).toBeInTheDocument();
  });
  it("anlatım türü düğme yerine düz cümle", async () => {
    await draw(orderOf({ tur: "anlatim" }));
    expect(screen.getByText(ORDER_SEND_PROBLEM_PLAIN.kind_narration)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("işler kapalıyken hiçbir şey çizmez", async () => {
    mocks.loadJobsState.mockResolvedValue({ canRun: false });
    const closed = await draw(orderOf({}));
    expect(closed.container).toBeEmptyDOMElement();
  });
  it("üretilmiş fişte hiçbir şey çizmez", async () => {
    const done = await draw(orderOf({ status: "uretildi" }));
    expect(done.container).toBeEmptyDOMElement();
  });
});
