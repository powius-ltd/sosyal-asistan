import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, repo } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  repo: {
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    updateAlertSettings: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath }));

vi.mock("@/lib/data", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/data")>();
  return { ...original, getPanelContext: async () => ({ repo, wsId: "ws_test", now: new Date("2026-09-30T09:00:00Z") }) };
});

import { updateAlertSettingsAction } from "@/app/actions/alert-settings";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/notifications";
import { RepositoryError } from "@/lib/data/repository";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("markNotificationReadAction", () => {
  it("bildirimi workspace ile okundu yapar; zil rozeti için düzeni ve listeyi yeniler", async () => {
    repo.markNotificationRead.mockResolvedValue({ id: "nt_01" });
    const result = await markNotificationReadAction({ id: "  nt_01 " });
    expect(result).toEqual({ ok: true, id: "nt_01" });
    expect(repo.markNotificationRead).toHaveBeenCalledWith("ws_test", "nt_01");
    // Zil rozeti düzende okunur: düzen (layout) yeniden doğrulanmazsa rozet eskimiş kalır.
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/bildirimler");
  });

  it("geçersiz girdiyi depoya gitmeden Türkçe mesajla reddeder", async () => {
    for (const bad of [null, undefined, {}, { id: "" }, { id: "   " }, { id: 5 }, { id: "x".repeat(129) }, "nt_01"]) {
      const result = await markNotificationReadAction(bad);
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
      expect(result.ok === false && result.message).toMatch(/Geçersiz/);
    }
    expect(repo.markNotificationRead).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("bulunamayan bildirimde Türkçe mesaj verir ve listeyi yeniler (ekran eskimiş olabilir)", async () => {
    repo.markNotificationRead.mockRejectedValue(new RepositoryError("not_found", "nt_yok"));
    const result = await markNotificationReadAction({ id: "nt_yok" });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(result.ok === false && result.message).toContain("Bildirim bulunamadı");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("beklenmeyen hatada ayrıntı sızdırmaz", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    repo.markNotificationRead.mockRejectedValue(new Error("db parolası: hunter2"));
    const result = await markNotificationReadAction({ id: "nt_01" });
    spy.mockRestore();
    expect(result).toMatchObject({ ok: false, code: "unknown" });
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("markAllNotificationsReadAction", () => {
  it("okundu yapılan sayıyı döndürür ve düzeni yeniler; 0 geçerlidir", async () => {
    repo.markAllNotificationsRead.mockResolvedValueOnce(6);
    expect(await markAllNotificationsReadAction()).toEqual({ ok: true, marked: 6 });
    expect(repo.markAllNotificationsRead).toHaveBeenCalledWith("ws_test");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/bildirimler");

    repo.markAllNotificationsRead.mockResolvedValueOnce(0);
    expect(await markAllNotificationsReadAction()).toEqual({ ok: true, marked: 0 });
  });

  it("depo hatasını Türkçe mesaja çevirir ve yenilemez", async () => {
    repo.markAllNotificationsRead.mockRejectedValue(new RepositoryError("not_found", "ws yok"));
    expect(await markAllNotificationsReadAction()).toMatchObject({ ok: false, code: "not_found" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateAlertSettingsAction", () => {
  const valid = {
    competitorOutlier: { enabled: true, minTier: 2 },
    ownOutlier: { enabled: false, minTier: 4 },
    weeklyDigest: { enabled: true, weekday: 4, hour: 18 },
    channels: { email: { enabled: true, address: " ad@ornek.com " }, telegram: { enabled: false } },
  };

  it("geçerli yamayı (kırpılmış) workspace ile depoya iletir ve Ayarlar'ı yeniler", async () => {
    repo.updateAlertSettings.mockResolvedValue({});
    const result = await updateAlertSettingsAction(valid);
    expect(result).toEqual({ ok: true });
    expect(repo.updateAlertSettings).toHaveBeenCalledWith("ws_test", {
      ...valid,
      channels: { email: { enabled: true, address: "ad@ornek.com" }, telegram: { enabled: false } },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/ayarlar");
  });

  it("geçersiz girdiyi depoya gitmeden Türkçe mesajla reddeder", async () => {
    const cases: [unknown, RegExp][] = [
      [{ competitorOutlier: { minTier: 0 } }, /Kademe/],
      [{ competitorOutlier: { minTier: 5 } }, /Kademe/],
      [{ ownOutlier: { enabled: "evet" } }, /Geçersiz seçim/],
      [{ weeklyDigest: { weekday: 7 } }, /Gün/],
      [{ weeklyDigest: { hour: 24 } }, /Saat/],
      [{ weeklyDigest: { hour: 9.5 } }, /Saat/],
      [{ channels: { email: { enabled: true, address: "adres-degil" } } }, /e-posta/i],
    ];
    for (const [input, message] of cases) {
      const result = await updateAlertSettingsAction(input);
      expect(result, JSON.stringify(input)).toMatchObject({ ok: false, code: "invalid_input" });
      expect(result.ok === false && result.message).toMatch(message);
    }
    expect((await updateAlertSettingsAction(null)).ok).toBe(false);
    expect(repo.updateAlertSettings).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("SIR alanlarını ve bilinmeyen alanı reddeder (katı şema)", async () => {
    const secrets: unknown[] = [
      { channels: { telegram: { enabled: false, chatId: "12345" } } },
      { channels: { telegram: { chatIdSet: true } } },
      { channels: { telegram: { botToken: "123:abc" } } },
      { channels: { inApp: false } },
      { channels: { email: { password: "x" } } },
      { botToken: "123:abc" },
    ];
    for (const input of secrets) {
      expect(await updateAlertSettingsAction(input), JSON.stringify(input)).toMatchObject({ ok: false, code: "invalid_input" });
    }
    expect(repo.updateAlertSettings).not.toHaveBeenCalled();
  });

  it("sohbeti bağlı olmayan Telegram'ı açma (invalid_state) ve adressiz e-posta (invalid_input) Türkçe mesajla döner", async () => {
    repo.updateAlertSettings.mockRejectedValueOnce(new RepositoryError("invalid_state", "Telegram sohbeti bağlı değil"));
    const telegram = await updateAlertSettingsAction({ channels: { telegram: { enabled: true } } });
    expect(telegram).toMatchObject({ ok: false, code: "invalid_state" });
    expect(telegram.ok === false && telegram.message).toContain("Telegram sohbeti bağlı değil");

    repo.updateAlertSettings.mockRejectedValueOnce(new RepositoryError("invalid_input", "adres"));
    const email = await updateAlertSettingsAction({ channels: { email: { enabled: true } } });
    expect(email).toMatchObject({ ok: false, code: "invalid_input" });
    expect(email.ok === false && email.message).toContain("adres");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
