// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateRegion = vi.fn();
vi.mock("@/app/actions/compliance-settings", () => ({ updateComplianceRegion: (...args: unknown[]) => updateRegion(...args) }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) } }));

import { ComplianceRegionField } from "@/components/settings/compliance-region-field";

beforeEach(() => {
  updateRegion.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("ComplianceRegionField", () => {
  const trigger = () => screen.getByRole("combobox", { name: "Uyum bölgesi" });

  it("kayıtlı bölgeyi seçili gösterir; değişiklik yokken kaydet devre dışı; açıklama bölgeye göre değişir", async () => {
    const user = userEvent.setup();
    render(<ComplianceRegionField region="TR" />);
    expect(trigger()).toHaveTextContent("Türkiye");
    expect(screen.getByRole("button", { name: "Bölgeyi kaydet" })).toBeDisabled();
    expect(screen.getByText(/“Reklam” ya da “Tanıtım” ibaresi, reklam veren adı ve yapay zekâ beyanı denetlenir/)).toBeInTheDocument();

    await user.click(trigger());
    expect(await screen.findAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("option", { name: "ABD (FTC)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Türkiye + ABD" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "ABD (FTC)" }));

    expect(trigger()).toHaveTextContent("ABD (FTC)");
    expect(screen.getByText(/FTC ilkelerine göre/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bölgeyi kaydet" })).toBeEnabled();
    expect(updateRegion).not.toHaveBeenCalled(); // seçmek kaydetmez
  });

  it("kaydet: sunucu action'ı seçilen bölgeyle çağrılır, başarı toast'ı çıkar", async () => {
    updateRegion.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ComplianceRegionField region="TR" />);
    await user.click(trigger());
    await user.click(await screen.findByRole("option", { name: "Türkiye + ABD" }));
    await user.click(screen.getByRole("button", { name: "Bölgeyi kaydet" }));

    await waitFor(() => expect(updateRegion).toHaveBeenCalledWith({ complianceRegion: "TR_US" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Uyum bölgesi kaydedildi."));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("sunucu hatası toast'ta gösterilir", async () => {
    updateRegion.mockResolvedValue({ ok: false, code: "invalid_input", message: "Uyum bölgesi TR, US ya da TR_US olmalı." });
    const user = userEvent.setup();
    render(<ComplianceRegionField region="US" />);
    await user.click(trigger());
    await user.click(await screen.findByRole("option", { name: "Türkiye" }));
    await user.click(screen.getByRole("button", { name: "Bölgeyi kaydet" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Uyum bölgesi TR, US ya da TR_US olmalı."));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
