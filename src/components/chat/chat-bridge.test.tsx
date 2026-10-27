// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { askAssistant } from "@/components/chat/chat-bridge";
import { ChatDock } from "@/components/chat/chat-dock";
import { bodyOf, mockFetch, ndjson } from "@/components/chat/chat-test-support";

/** Geniş: her sorgu eşleşir (md + lg); dar: hiçbiri eşleşmez (telefon). */
function setViewport(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const ANSWER = ndjson([{ type: "answer", kind: "answer", text: "Tamam.", evidence: [] }]);

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("sohbet köprüsü", () => {
  it("dinleyici yokken false döner", () => {
    expect(askAssistant("merhaba")).toBe(false);
  });

  it("geniş ekranda kapalı sütunu açar ve mesajı gönderir", async () => {
    setViewport(true);
    localStorage.setItem("sp-chat-dock", "closed");
    const fetchMock = mockFetch(ANSWER);
    render(<ChatDock assistantName="Maskot" starters={[]} />);
    expect(screen.queryByText("Asistan")).toBeNull();
    expect(askAssistant("Yeni verileri topla")).toBe(true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchMock, 0).question).toBe("Yeni verileri topla");
    expect(await screen.findByText("Asistan")).toBeTruthy();
    expect(localStorage.getItem("sp-chat-dock")).not.toBe("closed");
  });

  it("dar ekranda pencereyi açar ve mesajı gönderir", async () => {
    setViewport(false);
    const fetchMock = mockFetch(ANSWER);
    render(<ChatDock assistantName="Maskot" starters={[]} />);
    expect(askAssistant("Bu haftanın planını çıkar")).toBe(true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchMock, 0).question).toBe("Bu haftanın planını çıkar");
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});
