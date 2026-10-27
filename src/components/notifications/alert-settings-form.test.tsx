// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateAlertSettingsAction, toast } = vi.hoisted(() => ({
  updateAlertSettingsAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/app/actions/alert-settings", () => ({ updateAlertSettingsAction }));
vi.mock("sonner", () => ({ toast }));

import { AlertSettingsForm } from "@/components/notifications/alert-settings-form";
import { DEFAULT_ALERT_SETTINGS, type AlertSettings } from "@/lib/domain/notification";

const TZ = "Europe/Istanbul";
const withTelegram = (chatIdSet: boolean): AlertSettings => ({
  ...DEFAULT_ALERT_SETTINGS,
  channels: { inApp: true, email: { enabled: false }, telegram: { enabled: false, chatIdSet } },
});

beforeEach(() => {
  vi.clearAllMocks();
  updateAlertSettingsAction.mockResolvedValue({ ok: true });
});

describe("AlertSettingsForm: görünüm", () => {
  it("mevcut ayarları gösterir: kademe, gün, saat, saat dilimi, kanal durumları", () => {
    render(<AlertSettingsForm settings={DEFAULT_ALERT_SETTINGS} timeZone={TZ} />);
    expect(screen.getByRole("switch", { name: "Rakip içeriği tuttu" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Kendi içeriğin tuttu" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Haftalık özet" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "E-posta" })).not.toBeChecked();
    expect(screen.getAllByText("normalinin 3 katı ve üstü")).toHaveLength(2);
    expect(screen.getByText("Pazartesi")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText(/saat dilimi: İstanbul saati/)).toBeInTheDocument();
    // Uygulama içi kanal her zaman açık ve kapatılamaz (anahtar yok).
    expect(screen.getByText("Her zaman açık")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Uygulama içi" })).not.toBeInTheDocument();
  });

  it("gönderim henüz yok: not görünür, Test gönder devre dışı, Kaydet değişiklik olmadan devre dışı", () => {
    render(<AlertSettingsForm settings={DEFAULT_ALERT_SETTINGS} timeZone={TZ} />);
    expect(screen.getByText(/ile gönderim yakında/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test gönder" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  });

  it("Telegram: sohbet bağlı değilse yalnız durum gösterilir ve kanal açılamaz; kimlik/anahtar alanı yok", () => {
    render(<AlertSettingsForm settings={withTelegram(false)} timeZone={TZ} />);
    expect(screen.getByText("Sohbet bağlı değil")).toBeInTheDocument();
    // Base UI Switch devre dışıyken `disabled` yerine aria-disabled taşır.
    expect(screen.getByRole("switch", { name: "Telegram" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByLabelText(/chat|sohbet kimliği|token|anahtar/i)).not.toBeInTheDocument();
  });

  it("Telegram: sohbet bağlıysa kanal açılabilir", () => {
    render(<AlertSettingsForm settings={withTelegram(true)} timeZone={TZ} />);
    expect(screen.getByText("Sohbet bağlı")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Telegram" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("kapalı kuralın kademe seçici devre dışıdır", async () => {
    const user = userEvent.setup();
    render(<AlertSettingsForm settings={DEFAULT_ALERT_SETTINGS} timeZone={TZ} />);
    const tier = screen.getByRole("combobox", { name: "Rakip içeriği tuttu: en az kaç katı" });
    expect(tier).toBeEnabled();
    await user.click(screen.getByRole("switch", { name: "Rakip içeriği tuttu" }));
    expect(tier).toBeDisabled();
  });
});

describe("AlertSettingsForm: kayıt", () => {
  it("anahtar değişince Kaydet açılır; yalnız değişen alan sunucu action'ına gider ve toast gösterilir", async () => {
    const user = userEvent.setup();
    render(<AlertSettingsForm settings={DEFAULT_ALERT_SETTINGS} timeZone={TZ} />);
    await user.click(screen.getByRole("switch", { name: "Kendi içeriğin tuttu" }));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(updateAlertSettingsAction).toHaveBeenCalledTimes(1));
    // Yalnız değişen alan: ilgisiz gruplar (rakip eşiği, özet, e-posta, telegram) yamada yok.
    expect(updateAlertSettingsAction).toHaveBeenCalledWith({ ownOutlier: { enabled: false } });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Uyarı ayarları kaydedildi."));
    // Kaydedilen durum yeni taban: tekrar değişiklik yok → Kaydet yine devre dışı.
    await waitFor(() => expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled());
  });

  it("kademe seçimi (5x) yamaya minTier 4 olarak girer", async () => {
    const user = userEvent.setup();
    render(<AlertSettingsForm settings={DEFAULT_ALERT_SETTINGS} timeZone={TZ} />);
    await user.click(screen.getByRole("combobox", { name: "Rakip içeriği tuttu: en az kaç katı" }));
    await user.click(await screen.findByRole("option", { name: "normalinin 5 katı ve üstü" }));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(updateAlertSettingsAction).toHaveBeenCalledTimes(1));
    expect(updateAlertSettingsAction.mock.calls[0][0]).toEqual({ competitorOutlier: { minTier: 4 } });
  });

  it("gün ve saat seçimi yamaya girer (0 = Pzt)", async () => {
    const user = userEvent.setup();
    render(<AlertSettingsForm settings={DEFAULT_ALERT_SETTINGS} timeZone={TZ} />);
    await user.click(screen.getByRole("combobox", { name: "Haftalık özet günü" }));
    await user.click(await screen.findByRole("option", { name: "Cuma" }));
    await user.click(screen.getByRole("combobox", { name: "Haftalık özet saati" }));
    await user.click(await screen.findByRole("option", { name: "18:00" }));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(updateAlertSettingsAction).toHaveBeenCalledTimes(1));
    expect(updateAlertSettingsAction.mock.calls[0][0]).toEqual({ weeklyDigest: { weekday: 4, hour: 18 } });
  });

  it("e-posta kanalı adressiz açılınca kaydetmez, Türkçe hata gösterir", async () => {
    const user = userEvent.setup();
    render(<AlertSettingsForm settings={DEFAULT_ALERT_SETTINGS} timeZone={TZ} />);
    await user.click(screen.getByRole("switch", { name: "E-posta" }));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByRole("alert")).toHaveTextContent("E-posta kanalını açmak için bir adres gir.");
    expect(updateAlertSettingsAction).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("E-posta adresi"), "ad@ornek.com");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(updateAlertSettingsAction).toHaveBeenCalledTimes(1));
    expect(updateAlertSettingsAction.mock.calls[0][0]).toEqual({ channels: { email: { enabled: true, address: "ad@ornek.com" } } });
  });

  it("sunucu hatasında mesajı toast ile gösterir; kayıt tabanı değişmez (Kaydet açık kalır)", async () => {
    updateAlertSettingsAction.mockResolvedValue({ ok: false, code: "invalid_state", message: "Telegram sohbeti bağlı değil; kanalı açmadan önce sohbeti bağla." });
    const user = userEvent.setup();
    render(<AlertSettingsForm settings={DEFAULT_ALERT_SETTINGS} timeZone={TZ} />);
    await user.click(screen.getByRole("switch", { name: "Haftalık özet" }));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Telegram sohbeti bağlı değil; kanalı açmadan önce sohbeti bağla."));
    expect(toast.success).not.toHaveBeenCalled();
    // İşlem bitince düğme yeniden "Kaydet" olur ve açık kalır (kayıt tabanı değişmedi).
    expect(await screen.findByRole("button", { name: "Kaydet" })).toBeEnabled();
  });
});
