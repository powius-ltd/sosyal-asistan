// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/icerikler" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { ChatDock } from "@/components/chat/chat-dock";
import { liveResponse, mockFetch, ndjson } from "@/components/chat/chat-test-support";
import type { ChatEvent } from "@/lib/agents/chat/events";

const STARTERS = ["Bu hafta ne çekmeliyim?", "Son videom nasıl gitti?"];
const ANSWER: ChatEvent = { type: "answer", kind: "answer", text: "En güçlü videon normal izlenmenin 7,2 katı.", confidence: "medium", evidence: ["c:ci_048"] };

const viewport = { desktop: true, listeners: new Set<() => void>() };
function setViewport(desktop: boolean) {
  viewport.desktop = desktop;
  viewport.listeners.clear();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return query.includes("1024") ? false : viewport.desktop;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => viewport.listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => viewport.listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
/** Çalışırken pencere genişliği değişir (`md` kırılımı): dinleyicilere haber verir. */
function resizeTo(desktop: boolean) {
  viewport.desktop = desktop;
  act(() => viewport.listeners.forEach((listener) => listener()));
}

const dock = (props: Partial<React.ComponentProps<typeof ChatDock>> = {}) => <ChatDock assistantName="Maskot" starters={STARTERS} {...props} />;
const launcher = () => screen.getByRole("button", { name: /Maskot'a sor/ });

beforeEach(() => {
  pathname.current = "/icerikler";
  setViewport(true);
});
afterEach(() => vi.unstubAllGlobals());

describe("ChatDock: sayfa değişince", () => {
  it("masaüstünde pencere AÇIK kalır ve konuşma durur (kanıt bağlantısına basınca sayfa pencerenin yanında açılır)", async () => {
    const user = userEvent.setup();
    mockFetch(ndjson([ANSWER]));
    const view = render(dock());
    await user.click(launcher());
    await user.click(await screen.findByRole("button", { name: STARTERS[0] }));
    await screen.findByText(/7,2 katı/);

    pathname.current = "/bu-hafta";
    view.rerender(dock());
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    expect(launcher()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/7,2 katı/)).toBeInTheDocument();
  });

  it("telefonda pencere KAPANIR (tam ekran sayfayı örter), konuşma durur; yeniden açınca geri gelir", async () => {
    setViewport(false);
    const user = userEvent.setup();
    mockFetch(ndjson([ANSWER]));
    const view = render(dock());
    await user.click(launcher());
    await user.click(await screen.findByRole("button", { name: STARTERS[0] }));
    await screen.findByText(/7,2 katı/);

    pathname.current = "/bu-hafta";
    view.rerender(dock());
    await waitFor(() => expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument());
    expect(launcher()).toHaveAttribute("aria-expanded", "false");

    await user.click(launcher());
    expect(await screen.findByText(/7,2 katı/)).toBeInTheDocument();
  });

  it("telefonda açıp başka sayfaya gidip GERİ dönünce pencere kapalı kalır (açık durumu sıfırlanır)", async () => {
    setViewport(false);
    const user = userEvent.setup();
    const view = render(dock());
    await user.click(launcher());
    await screen.findByTestId("chat-panel");

    pathname.current = "/bu-hafta";
    view.rerender(dock());
    await waitFor(() => expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument());

    pathname.current = "/icerikler";
    view.rerender(dock());
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    expect(launcher()).toHaveAttribute("aria-expanded", "false");
  });

  it("masaüstünde açıkken sayfa değişip ekran daralınca pencere kapanır; yeniden genişleyince kendiliğinden AÇILMAZ", async () => {
    const user = userEvent.setup();
    const view = render(dock());
    await user.click(launcher());
    await screen.findByTestId("chat-panel");
    pathname.current = "/bu-hafta";
    view.rerender(dock());
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();

    resizeTo(false);
    await waitFor(() => expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument());
    resizeTo(true);
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
    expect(launcher()).toHaveAttribute("aria-expanded", "false");
  });

  it("Bugün sayfasında (/) de çizilir: soru kutusu sayfadan kalktı, düğme her sayfada", () => {
    pathname.current = "/";
    render(dock());
    expect(launcher()).toBeInTheDocument();
  });
});

describe("ChatDock: yüzen pencere", () => {
  it("masaüstünde sayfaya basmak kapatmaz; Esc ve 'Sohbeti kapat' kapatır, odak düğmeye döner", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Sayfadaki düğme</button>
        {dock()}
      </>,
    );
    await user.click(launcher());
    await screen.findByTestId("chat-panel");

    await user.click(screen.getByRole("button", { name: "Sayfadaki düğme" }));
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("textbox", { name: "Sorun" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument());
    expect(launcher()).toHaveFocus();

    await user.click(launcher());
    await user.click(await screen.findByRole("button", { name: "Sohbeti kapat" }));
    await waitFor(() => expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument());
  });

  it("masaüstünde odak sayfadayken de Esc pencereyi kapatır; başka katman Esc'i zaten ele aldıysa kapatmaz", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Sayfadaki düğme</button>
        {dock()}
      </>,
    );
    await user.click(launcher());
    await screen.findByTestId("chat-panel");
    await user.click(screen.getByRole("button", { name: "Sayfadaki düğme" }));
    expect(screen.getByRole("button", { name: "Sayfadaki düğme" })).toHaveFocus();

    // Üstteki başka bir katman Esc'i ele aldı (yakalama evresinde preventDefault): sohbet dokunmaz.
    const handled = (event: KeyboardEvent) => event.preventDefault();
    document.addEventListener("keydown", handled, true);
    await user.keyboard("{Escape}");
    document.removeEventListener("keydown", handled, true);
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument());
  });

  it("düğme aç/kapa: ikinci tıklama pencereyi kapatır", async () => {
    const user = userEvent.setup();
    render(dock());
    await user.click(launcher());
    await screen.findByTestId("chat-panel");
    await user.click(launcher());
    await waitFor(() => expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument());
  });
});

describe("ChatDock: düğmenin durumu", () => {
  it("karar bekliyorsa sarı nokta (turn), yoksa ya da okunamadıysa sakin", () => {
    const view = render(dock({ attention: 2 }));
    expect(launcher()).toHaveAttribute("data-mascot", "turn");
    view.rerender(dock({ attention: 0 }));
    expect(launcher()).toHaveAttribute("data-mascot", "waiting");
    view.rerender(dock({ attention: undefined }));
    expect(launcher()).toHaveAttribute("data-mascot", "waiting");
  });

  it("pencere kapalıyken yanıt hazırlanır (thinking, canlı bölge konuşur), gelince 'Yeni yanıt var' (telling); açınca söner ve karar noktası döner", async () => {
    const live = liveResponse();
    mockFetch(live.response);
    const user = userEvent.setup();
    render(dock({ attention: 1 }));
    await user.click(launcher());
    await user.click(await screen.findByRole("button", { name: STARTERS[0] }));
    await user.click(launcher()); // pencere kapanır, istek sürer
    await waitFor(() => expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument());
    expect(launcher()).toHaveAttribute("data-mascot", "thinking");
    expect(screen.getByRole("status")).toHaveTextContent("Yanıt hazırlanıyor…");

    act(() => {
      live.push(ANSWER);
      live.close();
    });
    await waitFor(() => expect(launcher()).toHaveAttribute("data-mascot", "telling"));
    expect(screen.getByRole("status")).toHaveTextContent("Yeni yanıt var");

    await user.click(launcher());
    await screen.findByTestId("chat-panel");
    expect(launcher()).toHaveAttribute("data-mascot", "turn");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("telefonda yazı alanı odaktayken düğme gizlenir (klavyenin üstüne çıkıp alanı örtmesin); masaüstünde gizlenmez", async () => {
    setViewport(false);
    const user = userEvent.setup();
    const view = render(
      <>
        <input aria-label="Sayfadaki alan" />
        {dock()}
      </>,
    );
    await user.click(screen.getByRole("textbox", { name: "Sayfadaki alan" }));
    expect(screen.getByTestId("chat-launcher")).toHaveClass("hidden");
    await user.tab();
    expect(screen.getByTestId("chat-launcher")).not.toHaveClass("hidden");
    view.unmount();

    setViewport(true);
    render(
      <>
        <input aria-label="Sayfadaki alan" />
        {dock()}
      </>,
    );
    await user.click(screen.getByRole("textbox", { name: "Sayfadaki alan" }));
    expect(screen.getByTestId("chat-launcher")).not.toHaveClass("hidden");
  });
});

describe("ChatDock: telefonda kapanırken yazı kutusu odaktaysa düğme gizli kalmaz", () => {
  it("pencere Esc ile kapanınca", async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(dock());
    await user.click(launcher());
    await user.click(await screen.findByRole("textbox", { name: "Sorun" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("chat-launcher")).not.toHaveClass("hidden"));
  });

  it("sayfa değişince pencere kapandığında", async () => {
    setViewport(false);
    const user = userEvent.setup();
    const view = render(dock());
    await user.click(launcher());
    await user.click(await screen.findByRole("textbox", { name: "Sorun" }));

    pathname.current = "/bu-hafta";
    view.rerender(dock());
    await waitFor(() => expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("chat-launcher")).not.toHaveClass("hidden"));
  });
});

