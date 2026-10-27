import { describe, expect, it } from "vitest";

import { isDirty, toFormState, toPatch, validateForm } from "@/components/notifications/alert-settings-state";
import { parseAlertSettingsPatch } from "@/lib/data/alert-settings-patch";
import { DEFAULT_ALERT_SETTINGS, type AlertSettings } from "@/lib/domain/notification";

describe("alert-settings-state", () => {
  const saved = toFormState(DEFAULT_ALERT_SETTINGS);

  it("varsayılan ayarlar → form durumu; fark yoksa yama boş", () => {
    expect(saved).toMatchObject({ competitorEnabled: true, competitorTier: 3, digestWeekday: 0, digestHour: 9, emailEnabled: false, emailAddress: "" });
    expect(toPatch(saved, saved)).toEqual({});
  });

  it("yama YALNIZ değişen alanları taşır; her değişim türü sunucu şemasından geçer", () => {
    const changed = { ...saved, ownEnabled: false, competitorTier: 4 as const, digestWeekday: 4, digestHour: 18, emailEnabled: true, emailAddress: " ad@ornek.com ", telegramEnabled: true };
    const patch = toPatch(changed, saved);
    expect(patch).toEqual({
      competitorOutlier: { minTier: 4 },
      ownOutlier: { enabled: false },
      weeklyDigest: { weekday: 4, hour: 18 },
      channels: { email: { enabled: true, address: "ad@ornek.com" }, telegram: { enabled: true } },
    });
    expect(parseAlertSettingsPatch(patch)).toEqual(patch);
  });

  it("dokunulmayan grup yamada yok: eşik değişimi telegram.enabled (ya da e-posta) göndermez", () => {
    const patch = toPatch({ ...saved, competitorTier: 2 }, saved);
    expect(patch).toEqual({ competitorOutlier: { minTier: 2 } });
    expect(patch).not.toHaveProperty("channels");
    // Telegram açık kaydedilmişken bile ilgisiz bir değişiklik kanalı yeniden göndermez.
    const telegramOn = { ...saved, telegramEnabled: true };
    expect(toPatch({ ...telegramOn, digestHour: 10 }, telegramOn)).toEqual({ weeklyDigest: { hour: 10 } });
  });

  it("yama SIR alanı taşımaz (chatIdSet, inApp, sohbet kimliği yok)", () => {
    const settings: AlertSettings = {
      ...DEFAULT_ALERT_SETTINGS,
      channels: { inApp: true, email: { enabled: true, address: "a@b.co" }, telegram: { enabled: true, chatIdSet: true } },
    };
    const before = toFormState(DEFAULT_ALERT_SETTINGS);
    const patch = toPatch(toFormState(settings), before);
    expect(JSON.stringify(patch)).not.toMatch(/chatId|inApp|token|secret/i);
    expect(patch.channels?.telegram).toEqual({ enabled: true });
  });

  it("adres kırpılır; boş adres '' ile silinir; yalnız boşluk farkı yamaya girmez", () => {
    const state = { ...saved, emailAddress: "  ad@ornek.com " };
    expect(toPatch(state, saved).channels?.email).toEqual({ address: "ad@ornek.com" });
    const withAddress = { ...saved, emailAddress: "ad@ornek.com" };
    expect(toPatch({ ...withAddress, emailAddress: "   " }, withAddress).channels?.email?.address).toBe("");
    expect(toPatch({ ...withAddress, emailAddress: " ad@ornek.com " }, withAddress)).toEqual({});
  });

  it("isDirty: alan değişimi kirli, yalnız adres boşluğu değil", () => {
    const saved = toFormState(DEFAULT_ALERT_SETTINGS);
    expect(isDirty(saved, saved)).toBe(false);
    expect(isDirty({ ...saved, digestHour: 10 }, saved)).toBe(true);
    expect(isDirty({ ...saved, emailAddress: "  " }, saved)).toBe(false);
  });

  it("validateForm: e-posta kanalı açıksa adres zorunlu", () => {
    const state = toFormState(DEFAULT_ALERT_SETTINGS);
    expect(validateForm(state)).toEqual({});
    expect(validateForm({ ...state, emailEnabled: true }).emailAddress).toMatch(/adres/);
    expect(validateForm({ ...state, emailEnabled: true, emailAddress: "a@b.co" })).toEqual({});
  });
});
