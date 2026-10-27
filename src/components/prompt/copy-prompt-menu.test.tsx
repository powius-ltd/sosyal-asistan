// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { buildPromptAction, toast } = vi.hoisted(() => ({
  buildPromptAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/app/actions/prompt", () => ({ buildPromptAction }));
vi.mock("sonner", () => ({ toast }));

import { CopyPromptMenu } from "@/components/prompt/copy-prompt-menu";

const SOURCE = { kind: "content", contentId: "ci_001" } as const;
const TEXT = "## Kanıt\nÖrnek prompt metni";

let writeText: ReturnType<typeof vi.fn>;

function stubClipboard(available: boolean) {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: available ? { writeText } : undefined,
    configurable: true,
  });
}

/** `userEvent.setup()` kendi pano taklidini kurar; testin panosu ondan SONRA tanımlanmalı. */
async function openMenu(clipboard = true) {
  const user = userEvent.setup();
  stubClipboard(clipboard);
  render(<CopyPromptMenu source={SOURCE} />);
  await user.click(screen.getByRole("button", { name: /Prompt olarak kopyala/ }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  buildPromptAction.mockResolvedValue({ ok: true, text: TEXT, language: "tr" });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("CopyPromptMenu", () => {
  it("menüde Türkçe ve English seçenekleri ile Önizle bulunur", async () => {
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: "Türkçe" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Önizle" })).toBeInTheDocument();
  });

  it("dil seçilince action'ı kaynak + dille çağırır, panoya yazar, 'Kopyalandı' ve toast gösterir", async () => {
    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "English" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEXT));
    expect(buildPromptAction).toHaveBeenCalledWith(SOURCE, "en");
    expect(await screen.findByRole("button", { name: /Kopyalandı/ })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("English"));
  });

  it("action hata dönerse toast.error gösterir, panoya yazmaz", async () => {
    buildPromptAction.mockResolvedValue({ ok: false, code: "not_found", message: "İçerik bulunamadı." });
    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Türkçe" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("İçerik bulunamadı."));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Prompt olarak kopyala/ })).toBeEnabled();
  });

  it("pano yoksa metni gösteren elle kopyalama penceresi açılır", async () => {
    const user = await openMenu(false);
    await user.click(await screen.findByRole("menuitem", { name: "Türkçe" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Prompt'u elle kopyala")).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt metni")).toHaveValue(TEXT);
    expect(toast.info).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("pano yazımı reddedilirse de elle kopyalama penceresi açılır", async () => {
    const user = await openMenu();
    writeText.mockRejectedValue(new Error("NotAllowedError"));
    await user.click(await screen.findByRole("menuitem", { name: "Türkçe" }));
    expect(await screen.findByLabelText("Prompt metni")).toHaveValue(TEXT);
  });

  it("Önizle: pencere metni gösterir; dil değişince o dilde yeniden istenir; Kopyala panoya yazar", async () => {
    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Önizle" }));

    expect(await screen.findByText("Prompt önizleme")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Prompt metni")).toHaveValue(TEXT));
    expect(buildPromptAction).toHaveBeenLastCalledWith(SOURCE, "tr");

    buildPromptAction.mockResolvedValue({ ok: true, text: "English prompt", language: "en" });
    await user.click(screen.getByRole("button", { name: "English" }));
    await waitFor(() => expect(screen.getByLabelText("Prompt metni")).toHaveValue("English prompt"));
    expect(buildPromptAction).toHaveBeenLastCalledWith(SOURCE, "en");

    await user.click(screen.getByRole("button", { name: "Kopyala" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("English prompt"));
  });

  it("Önizle'de action hata verirse pencerede hata mesajı gösterilir", async () => {
    buildPromptAction.mockResolvedValue({ ok: false, code: "unknown", message: "Beklenmeyen bir hata oluştu." });
    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Önizle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Beklenmeyen bir hata oluştu.");
  });

  it("action fırlatırsa (ağ hatası) Türkçe hata toast'ı gösterir", async () => {
    buildPromptAction.mockRejectedValue(new Error("network"));
    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Türkçe" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("hazırlanamadı")));
  });
});
