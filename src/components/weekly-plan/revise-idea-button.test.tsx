// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ask: vi.fn(), toastError: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/actions/studio-orders", () => ({ createStudioOrderAction: vi.fn() }));
vi.mock("@/components/chat/chat-bridge", () => ({ askAssistant: mocks.ask }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

import { PlanItemCard } from "@/components/weekly-plan/plan-item-card";
import { makeIdea, makeItem } from "@/components/weekly-plan/test-fixtures";
import { ReviseIdeaButton } from "@/components/weekly-plan/revise-idea-button";
import { PANEL_JARGON } from "@/lib/plain-language";

beforeEach(() => vi.clearAllMocks());

describe("ReviseIdeaButton", () => {
  it("tıklayınca Asistan'a fikri adıyla anan mesaj gönderilir", async () => {
    mocks.ask.mockReturnValue(true);
    render(<ReviseIdeaButton title="Sabah rutini" />);
    await userEvent.click(screen.getByRole("button", { name: "Sohbetle değiştir" }));
    expect(mocks.ask).toHaveBeenCalledWith('"Sabah rutini" fikrini değiştirmek istiyorum.');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("Asistan açılamıyorsa sessiz kalmaz, kullanıcıya söyler", async () => {
    mocks.ask.mockReturnValue(false);
    render(<ReviseIdeaButton title="Sabah rutini" />);
    await userEvent.click(screen.getByRole("button", { name: "Sohbetle değiştir" }));
    expect(mocks.toastError).toHaveBeenCalledWith("Asistan şu an açılamıyor.");
  });
});

describe("PlanItemCard · Sohbetle değiştir", () => {
  it("düzenlenebilir fikirde görünür; bırakılmış / zamanlanmış / yayınlanmış fikirde yok; metin jargonsuz", () => {
    const base = makeItem(1, 1);
    const withStatus = (status: "new" | "saved" | "dismissed" | "scheduled" | "published") => ({ ...base, idea: makeIdea(1, { status }) });
    for (const status of ["new", "saved"] as const) {
      const view = render(<PlanItemCard item={withStatus(status)} audienceTimeZone="Europe/Istanbul" />);
      expect(screen.getByRole("button", { name: "Sohbetle değiştir" })).toBeInTheDocument();
      expect(view.container.textContent ?? "").not.toMatch(PANEL_JARGON);
      view.unmount();
    }
    for (const status of ["dismissed", "scheduled", "published"] as const) {
      const view = render(<PlanItemCard item={withStatus(status)} audienceTimeZone="Europe/Istanbul" />);
      expect(screen.queryByRole("button", { name: "Sohbetle değiştir" })).toBeNull();
      view.unmount();
    }
  });
});
