// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { ChatDock } from "@/components/chat/chat-dock";
import { DOCK_STORAGE_KEY } from "@/components/chat/use-dock-preference";

function setViewport(wide: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: wide || !query.includes("1024"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const renderDock = () => render(<ChatDock assistantName="Maskot" starters={["Bu hafta ne çekmeliyim?"]} />);
const launcher = () => screen.queryByRole("button", { name: /Maskot'a sor/ });

beforeEach(() => {
  window.localStorage.clear();
  setViewport(true);
});
afterEach(() => vi.restoreAllMocks());

describe("ChatDock: geniş ekran sütunu (lg+)", () => {
  it("varsayılan açık: sağ sütun çizilir, yüzen düğme yok, başlık düz 'Asistan', Demirkazık yok", () => {
    const { container } = renderDock();
    const aside = screen.getByTestId("chat-dock-aside");
    expect(aside).toHaveClass("border-l");
    expect(screen.getByRole("heading", { name: "Asistan" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-testid='chat-panel']")).toHaveLength(1);
    expect(launcher()).not.toBeInTheDocument();
    expect(aside.querySelector("svg[aria-label], [data-mascot]")).toBeNull();
  });

  it("kapat: sütun kalkar, düğme görünür, tercih 'closed' yazılır; düğme sütunu geri açar ('open')", async () => {
    const user = userEvent.setup();
    renderDock();
    await user.click(screen.getByRole("button", { name: "Sohbeti kapat" }));
    expect(screen.queryByTestId("chat-dock-aside")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DOCK_STORAGE_KEY)).toBe("closed");
    await user.click(launcher()!);
    expect(screen.getByTestId("chat-dock-aside")).toBeInTheDocument();
    expect(launcher()).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DOCK_STORAGE_KEY)).toBe("open");
  });

  it("kayıtlı tercih 'closed' ise başlangıçta kapalı, düğme görünür", () => {
    window.localStorage.setItem(DOCK_STORAGE_KEY, "closed");
    renderDock();
    expect(screen.queryByTestId("chat-dock-aside")).not.toBeInTheDocument();
    expect(launcher()).toBeInTheDocument();
  });

  it("localStorage okunamazsa açık", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderDock();
    expect(screen.getByTestId("chat-dock-aside")).toBeInTheDocument();
  });

  it("lg altında sütun çizilmez (yalnız düğme)", () => {
    setViewport(false);
    renderDock();
    expect(screen.queryByTestId("chat-dock-aside")).not.toBeInTheDocument();
    expect(launcher()).toBeInTheDocument();
  });
});
