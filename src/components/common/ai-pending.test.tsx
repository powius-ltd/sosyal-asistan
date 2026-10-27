// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AI_PENDING_SLOW_AFTER_MS, AiPending } from "@/components/common/ai-pending";

const STAGES = [
  { id: "facts", label: "Verilerine bakıyorum" },
  { id: "writing", label: "Yanıtı yazıyorum" },
];

afterEach(() => {
  vi.useRealTimers();
});

describe("AiPending", () => {
  it("yalnız ulaşılan aşamalar yazılır: şimdiki '…' ile, öncekiler tamam; sonraki henüz görünmez", () => {
    const { rerender } = render(<AiPending stages={STAGES} current="facts" />);
    expect(screen.getByText("Verilerine bakıyorum…")).toHaveAttribute("data-stage", "current");
    expect(screen.queryByText(/Yanıtı yazıyorum/)).not.toBeInTheDocument();

    rerender(<AiPending stages={STAGES} current="writing" />);
    expect(screen.getByText("Yanıtı yazıyorum…")).toHaveAttribute("data-stage", "current");
    const done = document.querySelector('[data-stage="done"]');
    expect(done).toHaveTextContent("Verilerine bakıyorum (tamam)");
  });

  it("'Vazgeç' ≥ 44 px düğmedir ve `onCancel`'i çağırır; `onCancel` yoksa düğme çizilmez", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<AiPending stages={STAGES} current="facts" onCancel={onCancel} />);
    const cancel = screen.getByRole("button", { name: "Vazgeç" });
    expect(cancel.className).toContain("h-11");
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();

    render(<AiPending stages={STAGES} current="facts" />);
    expect(screen.queryByRole("button", { name: "Vazgeç" })).not.toBeInTheDocument();
  });

  it("10 sn sonra 'Biraz sürebilir.' yazar; öncesinde yazmaz", () => {
    vi.useFakeTimers();
    render(<AiPending stages={STAGES} current="facts" />);
    act(() => vi.advanceTimersByTime(AI_PENDING_SLOW_AFTER_MS - 1));
    expect(screen.queryByText("Biraz sürebilir.")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("Biraz sürebilir.")).toBeInTheDocument();
  });

  it("`slow` dışarıdan verilirse kendi zamanlayıcısını kurmaz, verilen değeri gösterir", () => {
    vi.useFakeTimers();
    const { rerender } = render(<AiPending stages={STAGES} current="facts" slow={false} />);
    act(() => vi.advanceTimersByTime(AI_PENDING_SLOW_AFTER_MS * 2));
    expect(screen.queryByText("Biraz sürebilir.")).not.toBeInTheDocument();
    rerender(<AiPending stages={STAGES} current="facts" slow />);
    expect(screen.getByText("Biraz sürebilir.")).toBeInTheDocument();
  });

  it("ilerleme çizgisi süs sayılır (ekran okuyucudan gizli); iskelet yok", () => {
    const { container } = render(<AiPending stages={STAGES} current="facts" data-testid="bekleme" />);
    expect(screen.getByTestId("bekleme")).toBeInTheDocument();
    expect(container.querySelector(".animate-progress")?.parentElement).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });
});
