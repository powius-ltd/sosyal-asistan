// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/icerikler" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { bodyOf, liveResponse, mockFetch, ndjson } from "@/components/chat/chat-test-support";
import { ChatDock } from "@/components/chat/chat-dock";
import { CHAT_UNREACHABLE_MESSAGE } from "@/components/chat/chat-stream";
import type { ChatEvent } from "@/lib/agents/chat/events";
import { CHAT_ERROR_MESSAGE } from "@/lib/agents/chat/messages";

const STARTERS = ["Bu hafta ne çekmeliyim?", "Son videom nasıl gitti?"];
const ANSWER: ChatEvent = { type: "answer", kind: "answer", text: "En güçlü videon normal izlenmenin 7,2 katı.", confidence: "medium", evidence: ["c:ci_048", "plan:2026-09-28"] };
const SUCCESS: ChatEvent[] = [{ type: "stage", stage: "facts" }, { type: "stage", stage: "writing" }, ANSWER];

function setViewport(desktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("1024") ? false : desktop,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const renderDock = (props: Partial<React.ComponentProps<typeof ChatDock>> = {}) => render(<ChatDock assistantName="Maskot" starters={STARTERS} {...props} />);
const launcher = () => screen.getByRole("button", { name: /Maskot'a sor/ });

beforeEach(() => {
  pathname.current = "/icerikler";
  setViewport(true);
});
afterEach(() => vi.unstubAllGlobals());

describe("ChatDock: düğme ve açılış", () => {
  it("kapalıyken yalnız yüzen düğme: ad yönelme ekiyle, aria-expanded=false, aria-haspopup=dialog; panel yok", () => {
    renderDock({ assistantName: "Ali" });
    const button = screen.getByRole("button", { name: /Ali'ye sor/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
  });

  it("tıklayınca açılır (aria-expanded=true), karşılama + hazır sorular, odak yazma alanında; Esc kapatır ve odak düğmeye döner", async () => {
    const user = userEvent.setup();
    renderDock();
    await user.click(launcher());

    const panel = await screen.findByTestId("chat-panel");
    expect(launcher()).toHaveAttribute("aria-expanded", "true");
    expect(launcher()).toHaveAttribute("aria-controls");
    expect(within(panel).getByTestId("chat-welcome")).toHaveTextContent(/fişini yazmamı/i);
    expect(within(panel).getAllByRole("button", { name: /\?$/ }).map((b) => b.textContent)).toEqual(STARTERS);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Sorun" })).toHaveFocus());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument());
    expect(launcher()).toHaveFocus();
  });

  it("mobilde (md altı) tam ekran Sheet olarak açılır; konuşma günlüğü role=log", async () => {
    setViewport(false);
    const user = userEvent.setup();
    renderDock();
    await user.click(launcher());
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    const log = screen.getByRole("log", { name: "Konuşma" });
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(log).toHaveAttribute("aria-busy", "false");
  });
});

describe("ChatDock: soru → bekleme → yanıt", () => {
  it("hazır soru gönderilir; bekleme aşamaları gerçek olaylarla değişir; yanıt güven ifadesi ve 'Neden?' kanıt bağlantılarıyla gelir", async () => {
    const live = liveResponse();
    const fetchFn = mockFetch(live.response);
    const user = userEvent.setup();
    renderDock();
    await user.click(launcher());
    await user.click(await screen.findByRole("button", { name: STARTERS[0] }));

    // Soru hemen görünür; yazma alanı kilitli; aşama metni.
    expect(screen.getByText(STARTERS[0], { selector: "p" })).toBeInTheDocument();
    expect(bodyOf(fetchFn)).toEqual({ question: STARTERS[0], history: [] });
    expect(await screen.findByText("Verilerine bakıyorum…")).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("textbox", { name: "Sorun" })).toHaveAttribute("readonly");
    expect(launcher()).toHaveAttribute("data-mascot", "thinking");

    act(() => live.push({ type: "stage", stage: "writing" }));
    expect(await screen.findByText("Yanıtı yazıyorum…")).toBeInTheDocument();

    act(() => {
      live.push(ANSWER);
      live.close();
    });
    expect(await screen.findByText(ANSWER.type === "answer" ? ANSWER.text : "")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-pending")).not.toBeInTheDocument();
    expect(screen.getByText("kısmen eminim")).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveAttribute("aria-busy", "false");

    // "Neden?" yerel <details>: kanıt bağlantıları EvidenceLinks ile.
    const details = screen.getByText("Neden?").closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(screen.getByText("Neden?"));
    expect(details.open).toBe(true);
    expect(within(details).getByRole("link", { name: /video/i })).toHaveAttribute("href", "/video/ci_048");
    expect(within(details).getByRole("link", { name: /haftalık plan/i })).toHaveAttribute("href", "/bu-hafta?hafta=2026-09-28");
  });

  it("ikinci soruda geçmiş (yalnız soru ve yanıt metinleri) gönderilir; hata mesajları geçmişe girmez", async () => {
    const fetchFn = mockFetch(ndjson(SUCCESS));
    const user = userEvent.setup();
    renderDock();
    await user.click(launcher());
    await user.click(await screen.findByRole("button", { name: STARTERS[0] }));
    await screen.findByText(/7,2 katı/);

    await user.type(screen.getByRole("textbox", { name: "Sorun" }), "Peki ya sonra?");
    await user.click(screen.getByRole("button", { name: "Gönder" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(bodyOf(fetchFn, 1)).toEqual({
      question: "Peki ya sonra?",
      history: [
        { role: "user", text: STARTERS[0] },
        { role: "assistant", text: "En güçlü videon normal izlenmenin 7,2 katı." },
      ],
    });
  });

  it("'Vazgeç' isteği iptal eder; soru kalır, 'Vazgeçtin.' + Tekrar dene", async () => {
    let signal: AbortSignal | undefined;
    mockFetch((init) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("iptal", "AbortError"))));
    });
    const user = userEvent.setup();
    renderDock();
    await user.click(launcher());
    await user.click(await screen.findByRole("button", { name: STARTERS[1] }));
    await user.click(await screen.findByRole("button", { name: "Vazgeç" }));

    expect(signal?.aborted).toBe(true);
    expect(await screen.findByText("Vazgeçtin.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
    expect(screen.queryByTestId("chat-pending")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Sorun" })).not.toHaveAttribute("readonly");
  });
});

describe("ChatDock: hata ve veri yok", () => {
  it("hata balonunda Türkçe mesaj + Tekrar dene: aynı soru yeniden sorulur, hata kalkar, yanıt gelir", async () => {
    const fetchFn = mockFetch(ndjson([{ type: "error", code: "timeout", message: CHAT_ERROR_MESSAGE.timeout }], { status: 200 }), ndjson(SUCCESS));
    const user = userEvent.setup();
    renderDock();
    await user.click(launcher());
    await user.click(await screen.findByRole("button", { name: STARTERS[0] }));

    expect(await screen.findByRole("alert")).toHaveTextContent(CHAT_ERROR_MESSAGE.timeout);
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(await screen.findByText(/7,2 katı/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchFn, 1)).toEqual({ question: STARTERS[0], history: [] });
    // Soru tek kez görünür (yeniden eklenmez).
    expect(screen.getAllByText(STARTERS[0], { selector: "p" })).toHaveLength(1);
  });

  it("ağ hatasında sunucu mesajı yoktur: istemci Türkçe mesaj söyler", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const user = userEvent.setup();
    renderDock();
    await user.click(launcher());
    await user.click(await screen.findByRole("button", { name: STARTERS[0] }));
    expect(await screen.findByRole("alert")).toHaveTextContent(CHAT_UNREACHABLE_MESSAGE);
  });

  it("'kullanılamıyor' hatasında yazma alanı kapanır", async () => {
    mockFetch(ndjson([{ type: "error", code: "unavailable", message: CHAT_ERROR_MESSAGE.unavailable }], { status: 503 }));
    const user = userEvent.setup();
    renderDock();
    await user.click(launcher());
    await user.click(await screen.findByRole("button", { name: STARTERS[0] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sohbet şu an kullanılamıyor.");
    expect(screen.getByRole("textbox", { name: "Sorun" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gönder" })).toBeDisabled();
  });

  it("veri yok yanıtı: yalnız metin; yardımsız Ayarlar bağlantısı yok (D3-11); kanıt ve güven ifadesi yok", async () => {
    mockFetch(ndjson([{ type: "answer", kind: "no_data", text: "Henüz veri yok.", evidence: [] }]));
    const user = userEvent.setup();
    renderDock();
    await user.click(launcher());
    await user.click(await screen.findByRole("button", { name: STARTERS[0] }));
    expect(await screen.findByText("Henüz veri yok.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ayarlar/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Neden?")).not.toBeInTheDocument();
    expect(screen.queryByText(/eminim|emin değilim/)).not.toBeInTheDocument();
  });
});

describe("ChatDock: klavye", () => {
  it("masaüstü: Enter gönderir, Shift+Enter satır atlar", async () => {
    const fetchFn = mockFetch(ndjson(SUCCESS));
    const user = userEvent.setup();
    renderDock();
    await user.click(launcher());
    const box = await screen.findByRole("textbox", { name: "Sorun" });
    await user.type(box, "Birinci satır{Shift>}{Enter}{/Shift}İkinci satır");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(box).toHaveValue("Birinci satır\nİkinci satır");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchFn).question).toBe("Birinci satır\nİkinci satır");
    expect(box).toHaveValue("");
  });

  it("mobil: Enter satır atlar (göndermez); gönderim düğmeyle", async () => {
    setViewport(false);
    const fetchFn = mockFetch(ndjson(SUCCESS));
    const user = userEvent.setup();
    renderDock();
    await user.click(launcher());
    const box = await screen.findByRole("textbox", { name: "Sorun" });
    await user.type(box, "Merhaba{Enter}dünya");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(box).toHaveValue("Merhaba\ndünya");
    await user.click(screen.getByRole("button", { name: "Gönder" }));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
  });

  it("metin kutusu 500 karakterle sınırlı; boş soru gönderilemez", async () => {
    const user = userEvent.setup();
    renderDock();
    await user.click(launcher());
    const box = await screen.findByRole("textbox", { name: "Sorun" });
    expect(box).toHaveAttribute("maxlength", "500");
    expect(box).toHaveAttribute("enterkeyhint", "send");
    expect(screen.getByRole("button", { name: "Gönder" })).toBeDisabled();
    await user.type(box, "   ");
    expect(screen.getByRole("button", { name: "Gönder" })).toBeDisabled();
  });
});

describe("ChatDock: yavaş yanıt", () => {
  it("10 sn zamanlayıcısı dolunca 'Biraz sürebilir.' yazar; öncesinde yazmaz", async () => {
    // Sahte saat yerine yalnız 10 sn'lik zamanlayıcıyı yakalarız (Popover animasyonları gerçek zamanda çalışır).
    const slowCallbacks: (() => void)[] = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, ms?: number, ...args: unknown[]) => {
      if (ms === 10_000) {
        slowCallbacks.push(callback);
        return 0;
      }
      return realSetTimeout(callback, ms, ...args);
    }) as unknown as typeof setTimeout);
    try {
      const live = liveResponse();
      mockFetch(live.response);
      const user = userEvent.setup();
      renderDock();
      await user.click(launcher());
      await user.click(await screen.findByRole("button", { name: STARTERS[0] }));
      await screen.findByTestId("chat-pending");
      expect(slowCallbacks).toHaveLength(1);
      expect(screen.queryByText("Biraz sürebilir.")).not.toBeInTheDocument();
      act(() => slowCallbacks.forEach((callback) => callback()));
      expect(screen.getByText("Biraz sürebilir.")).toBeInTheDocument();
      live.close();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
