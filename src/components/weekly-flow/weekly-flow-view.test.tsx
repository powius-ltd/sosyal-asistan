// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CHAT_ASK_EVENT } from "@/components/chat/chat-bridge";
import { WeeklyFlowView } from "@/components/weekly-flow/weekly-flow-view";
import { WEEKLY_FLOW_COPY as COPY } from "@/lib/copy/weekly-flow";
import type { WeeklyFlowStep } from "@/lib/weekly-flow/types";

const STEPS: WeeklyFlowStep[] = [
  { key: "collect", state: "done", reason: "Veriler yeni." },
  { key: "analyze", state: "done", reason: "Videolar incelendi." },
  { key: "plan", state: "active", reason: "Bu hafta için plan henüz yok.", action: { kind: "chat", message: "Bu haftanın planını çıkar" }, secondaryAction: { kind: "link", href: "/bu-hafta" } },
  { key: "select", state: "waiting", reason: "Önce plan hazır olsun." },
  { key: "ticket", state: "blocked", reason: "Fişleri şu an okuyamadım." },
];

afterEach(() => vi.restoreAllMocks());

describe("WeeklyFlowView", () => {
  it("5 adımı sırayla çizer; durum ve sebep her kutuda", () => {
    render(<WeeklyFlowView steps={STEPS} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.getAttribute("data-state"))).toEqual(["done", "done", "active", "waiting", "blocked"]);
    expect(within(items[2]!).getByText(COPY.stepNames.plan)).toBeTruthy();
    expect(within(items[2]!).getByText("Bu hafta için plan henüz yok.")).toBeTruthy();
    expect(items[2]!.getAttribute("aria-current")).toBe("step");
    expect(items[0]!.getAttribute("aria-current")).toBeNull();
  });

  it("yalnız etkin adımda eylem düğmesi var", () => {
    render(<WeeklyFlowView steps={STEPS} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[2]!).getAllByRole("button")).toHaveLength(1);
    expect(within(items[0]!).queryByRole("button")).toBeNull();
    expect(within(items[3]!).queryByRole("button")).toBeNull();
  });

  it("link eylemi doğru adrese gider", () => {
    render(<WeeklyFlowView steps={STEPS} />);
    expect(screen.getByRole("link", { name: COPY.actionLabels.openPlan }).getAttribute("href")).toBe("/bu-hafta");
  });

  it("chat eylemi köprüyü çağırır (mesaj olay ayrıntısında)", async () => {
    const received: string[] = [];
    const listener = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; handled: boolean }>).detail;
      received.push(d.text);
      d.handled = true;
    };
    window.addEventListener(CHAT_ASK_EVENT, listener);
    render(<WeeklyFlowView steps={STEPS} />);
    await userEvent.click(screen.getByRole("button", { name: COPY.actionLabels.askAssistant }));
    window.removeEventListener(CHAT_ASK_EVENT, listener);
    expect(received).toEqual(["Bu haftanın planını çıkar"]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("sohbet yoksa düz bir not gösterir", async () => {
    render(<WeeklyFlowView steps={STEPS} />);
    await userEvent.click(screen.getByRole("button", { name: COPY.actionLabels.askAssistant }));
    expect(screen.getByRole("status").textContent).toBe(COPY.chatUnavailable);
  });
});
