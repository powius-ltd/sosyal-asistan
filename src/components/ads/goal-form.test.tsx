// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
const action = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/actions/ads", () => ({ updateAdGoalAction: action }));

import { GoalForm } from "@/components/ads/goal-form";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";

const ACCOUNT = "ad100000-0000-4000-8000-000000000001";
const COPY = AD_SCREEN_COPY.goal;

beforeEach(() => {
  vi.clearAllMocks();
  action.mockResolvedValue({ ok: true });
});

describe("GoalForm", () => {
  it("geçersiz sayıda Türkçe hata gösterir ve action'ı çağırmaz", async () => {
    const user = userEvent.setup();
    render(<GoalForm accountId={ACCOUNT} />);
    await user.click(screen.getByLabelText(COPY.resultLabel));
    await user.paste("satın alma");
    await user.click(screen.getByLabelText(COPY.targetReturn));
    await user.paste("abc");
    await user.click(screen.getByRole("button", { name: COPY.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.numberInvalid);
    expect(action).not.toHaveBeenCalled();
  });

  it("geçerli girdiyi (virgüllü sayı, yüzde marj) action'a oran olarak gönderir ve sayfayı yeniler", async () => {
    const user = userEvent.setup();
    render(<GoalForm accountId={ACCOUNT} />);
    await user.click(screen.getByLabelText(COPY.resultLabel));
    await user.paste("satın alma");
    await user.click(screen.getByLabelText(COPY.targetReturn));
    await user.paste("2,5");
    await user.click(screen.getByLabelText(COPY.grossMargin));
    await user.paste("40");
    await user.click(screen.getByRole("button", { name: COPY.save }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ accountId: ACCOUNT, goal: { kind: "value", resultLabel: "satın alma", targetReturn: 2.5, grossMargin: 0.4 } }));
    expect(await screen.findByRole("status")).toHaveTextContent(COPY.saved);
    expect(refresh).toHaveBeenCalled();
  });

  it("sunucu hatasını olduğu gibi gösterir", async () => {
    action.mockResolvedValue({ ok: false, code: "invalid_input", message: "Hedef getiri sıfırdan büyük olmalı." });
    const user = userEvent.setup();
    render(<GoalForm accountId={ACCOUNT} />);
    await user.click(screen.getByLabelText(COPY.resultLabel));
    await user.paste("form");
    await user.click(screen.getByLabelText(COPY.targetReturn));
    await user.paste("1");
    await user.click(screen.getByRole("button", { name: COPY.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Hedef getiri sıfırdan büyük olmalı.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("hedef varken 'Hedefi kaldır' null gönderir", async () => {
    const user = userEvent.setup();
    render(<GoalForm accountId={ACCOUNT} goal={{ kind: "cost", resultLabel: "mesaj", targetCostPerResult: 20 }} />);
    await user.click(screen.getByRole("button", { name: COPY.clear }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ accountId: ACCOUNT, goal: null }));
  });
});
