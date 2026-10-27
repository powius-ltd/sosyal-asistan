// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateWorkspaceSettings } = vi.hoisted(() => ({ updateWorkspaceSettings: vi.fn() }));
vi.mock("@/app/actions/settings", () => ({ updateWorkspaceSettings }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { WorkspaceForm } from "@/components/settings/workspace-form";

const initial = { apifyMonthlyCapUsd: 10, llmMonthlyCapUsd: 5, nicheBrief: "kahve", timezone: "Europe/Istanbul" };

beforeEach(() => {
  vi.clearAllMocks();
  updateWorkspaceSettings.mockResolvedValue({ ok: true });
});

describe("WorkspaceForm: tavan zorunlu", () => {
  it("tavan alanı boş bırakılınca kaydetmez, Türkçe hata gösterir (tavan kaldırılamaz)", async () => {
    const user = userEvent.setup();
    render(<WorkspaceForm initial={initial} />);
    await user.clear(screen.getByLabelText("Aylık Apify tavanı (USD)"));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByText(/Tavan zorunlu/)).toBeInTheDocument();
    expect(updateWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("aralık dışı değer (1001) kaydetmez", async () => {
    const user = userEvent.setup();
    render(<WorkspaceForm initial={initial} />);
    await user.clear(screen.getByLabelText("Aylık LLM tavanı (USD)"));
    await user.type(screen.getByLabelText("Aylık LLM tavanı (USD)"), "1001");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByText(/en fazla 1000/)).toBeInTheDocument();
    expect(updateWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("0 geçerlidir (harcama kapalı) ve sayı olarak gönderilir; null gönderilmez", async () => {
    const user = userEvent.setup();
    render(<WorkspaceForm initial={initial} />);
    await user.clear(screen.getByLabelText("Aylık Apify tavanı (USD)"));
    await user.type(screen.getByLabelText("Aylık Apify tavanı (USD)"), "0");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({ apifyMonthlyCapUsd: 0, llmMonthlyCapUsd: 5, nicheBrief: "kahve" });
  });
});

describe("WorkspaceForm: müşteri görünümü (showCaps=false)", () => {
  it("tavan alanları çizilmez; yalnız niş tanımı kaydedilir, tavanlara dokunulmaz", async () => {
    const user = userEvent.setup();
    render(<WorkspaceForm initial={initial} showCaps={false} />);
    expect(screen.queryByLabelText("Aylık Apify tavanı (USD)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Aylık LLM tavanı (USD)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({ nicheBrief: "kahve" });
  });
});

describe("WorkspaceForm: niş sınırı (D3-18)", () => {
  it("sınırı aşan niş tanımı kaydetmez; hata alanın altında yazılır, alan işaretlenir ve odak alana gider", async () => {
    const user = userEvent.setup();
    render(<WorkspaceForm initial={initial} showCaps={false} />);
    const niche = screen.getByLabelText("Niş tanımı");
    await user.clear(niche);
    await user.click(niche);
    await user.paste("a".repeat(2100));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/en fazla 2000 karakter/);
    expect(niche).toHaveAttribute("aria-invalid", "true");
    expect(niche).toHaveFocus();
    expect(updateWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("saat dilimi devre dışıdır ve nedeni yazılıdır; müşteri 'İstanbul saati' okur, yönetici IANA adını", () => {
    const { unmount } = render(<WorkspaceForm initial={initial} showCaps={false} />);
    expect(screen.getByLabelText("Saat dilimi")).toHaveValue("İstanbul saati");
    expect(screen.getByText(/Şimdilik değiştirilemez/)).toBeInTheDocument();
    unmount();
    render(<WorkspaceForm initial={initial} />);
    expect(screen.getByLabelText("Saat dilimi")).toHaveValue("Europe/Istanbul");
  });
});
