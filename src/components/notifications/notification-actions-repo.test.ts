/**
 * Okundu ve uyarı ayarı action'ları GERÇEK mock depoyla (yalnız `next/cache` taklit): action → depo sözleşmesi uçtan uca.
 * Mock depo süreç boyunca tek örnektir; bu dosyanın testleri sırayla ve birbirinin durumunu bilerek yazılmıştır.
 */
import { describe, expect, it, vi } from "vitest";

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { updateAlertSettingsAction } from "@/app/actions/alert-settings";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/notifications";
import { getPanelContext } from "@/lib/data";
import { DEFAULT_ALERT_SETTINGS } from "@/lib/domain/notification";

describe("okundu action'ları (gerçek mock depo)", () => {
  it("tek bildirim okundu olur (idempotent), okunmamış sayısı düşer; bilinmeyen kimlik not_found", async () => {
    const { repo, wsId } = await getPanelContext();
    const before = await repo.countUnreadNotifications(wsId);
    const target = (await repo.listNotifications(wsId, { unreadOnly: true, limit: 1 })).items[0];
    expect(target, "mock seed: okunmamış bildirim var").toBeDefined();

    expect(await markNotificationReadAction({ id: target.id })).toEqual({ ok: true, id: target.id });
    expect(await repo.countUnreadNotifications(wsId)).toBe(before - 1);
    // İdempotent: ikinci çağrı sayıyı değiştirmez.
    expect(await markNotificationReadAction({ id: target.id })).toEqual({ ok: true, id: target.id });
    expect(await repo.countUnreadNotifications(wsId)).toBe(before - 1);

    expect(await markNotificationReadAction({ id: "nt_yok" })).toMatchObject({ ok: false, code: "not_found" });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("tümü okundu: kalan okunmamış sayısını döndürür; ikinci çağrı 0", async () => {
    const { repo, wsId } = await getPanelContext();
    const remaining = await repo.countUnreadNotifications(wsId);
    expect(remaining).toBeGreaterThan(0);
    expect(await markAllNotificationsReadAction()).toEqual({ ok: true, marked: remaining });
    expect(await repo.countUnreadNotifications(wsId)).toBe(0);
    expect(await markAllNotificationsReadAction()).toEqual({ ok: true, marked: 0 });
  });
});

describe("uyarı ayarı action'ı (gerçek mock depo)", () => {
  it("yama kaydedilir ve depodan okunur; e-posta adressiz ve sohbetsiz Telegram Türkçe mesajla reddedilir", async () => {
    const { repo, wsId } = await getPanelContext();

    const result = await updateAlertSettingsAction({
      competitorOutlier: { enabled: true, minTier: 4 },
      weeklyDigest: { enabled: true, weekday: 4, hour: 18 },
      channels: { email: { enabled: true, address: "ad@ornek.com" } },
    });
    expect(result).toEqual({ ok: true });
    const saved = await repo.getAlertSettings(wsId);
    expect(saved.competitorOutlier).toEqual({ enabled: true, minTier: 4 });
    expect(saved.weeklyDigest).toEqual({ enabled: true, weekday: 4, hour: 18 });
    expect(saved.channels.email).toEqual({ enabled: true, address: "ad@ornek.com" });
    expect(revalidatePath).toHaveBeenCalledWith("/ayarlar");

    const noAddress = await updateAlertSettingsAction({ channels: { email: { enabled: true, address: "" } } });
    expect(noAddress).toMatchObject({ ok: false, code: "invalid_input" });
    expect(noAddress.ok === false && noAddress.message).toContain("adres");

    const telegram = await updateAlertSettingsAction({ channels: { telegram: { enabled: true } } });
    expect(telegram).toMatchObject({ ok: false, code: "invalid_state" });
    expect(telegram.ok === false && telegram.message).toContain("Telegram sohbeti bağlı değil");
    // Reddedilen yama durumu değiştirmez.
    expect((await repo.getAlertSettings(wsId)).channels.telegram?.enabled).toBe(false);

    // Özgün değerlere dön (bu dosyanın süreç durumu).
    const restore = await updateAlertSettingsAction({
      competitorOutlier: DEFAULT_ALERT_SETTINGS.competitorOutlier,
      weeklyDigest: DEFAULT_ALERT_SETTINGS.weeklyDigest,
      channels: { email: { enabled: false, address: "" } },
    });
    expect(restore).toEqual({ ok: true });
  });
});
