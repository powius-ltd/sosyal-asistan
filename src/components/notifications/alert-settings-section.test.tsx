// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/alert-settings", () => ({ updateAlertSettingsAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ALERT_SETTINGS_ANCHOR } from "@/components/notifications/alert-settings-state";
import { AlertSettingsSection } from "@/components/settings/alert-settings-section";
import { getPanelContext } from "@/lib/data";
import { timeZonePlain } from "@/lib/plain-language-account";

describe("AlertSettingsSection", () => {
  it("workspace saat diliminde form çizer; bağlantı hedefi (#uyarilar) ve bölüm başlığı vardır", async () => {
    const { repo, wsId } = await getPanelContext();
    const settings = await repo.getAlertSettings(wsId);
    const workspace = await repo.getWorkspace(wsId);

    const { container } = render(await AlertSettingsSection({ settings }));
    expect(container.querySelector(`#${ALERT_SETTINGS_ANCHOR}`)).not.toBeNull();
    expect(screen.getByText("Bildirimler ve uyarılar")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`saat dilimi: ${timeZonePlain(workspace?.timezone ?? "")}`))).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Rakip içeriği tuttu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test gönder" })).toBeDisabled();
  });
});
