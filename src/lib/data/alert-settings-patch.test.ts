import { describe, expect, it } from "vitest";

import { DEFAULT_ALERT_SETTINGS, type AlertSettings } from "@/lib/domain/notification";
import { applyAlertSettingsPatch, parseAlertSettingsPatch } from "@/lib/data/alert-settings-patch";

const code = (c: string) => expect.objectContaining({ code: c });
const current = (): AlertSettings => structuredClone(DEFAULT_ALERT_SETTINGS);

describe("parseAlertSettingsPatch", () => {
  it("boş yama geçerli; geçerli sınırlar kabul edilir", () => {
    expect(parseAlertSettingsPatch({})).toEqual({});
    expect(parseAlertSettingsPatch({ weeklyDigest: { weekday: 6, hour: 23 }, ownOutlier: { minTier: 1 } })).toEqual({
      weeklyDigest: { weekday: 6, hour: 23 },
      ownOutlier: { minTier: 1 },
    });
  });

  it("aralık dışı, tamsayı olmayan, tipi yanlış ve bilinmeyen alan invalid_input (sır alanları dahil)", () => {
    const bad = [
      { weeklyDigest: { weekday: 7 } },
      { weeklyDigest: { hour: 24 } },
      { weeklyDigest: { hour: 1.5 } },
      { competitorOutlier: { minTier: 0 } },
      { competitorOutlier: { minTier: 5 } },
      { ownOutlier: { enabled: 1 } },
      { channels: { inApp: false } },
      { channels: { telegram: { chatIdSet: true } } },
      { channels: { telegram: { token: "x" } } },
      { channels: { email: { password: "x" } } },
      { channels: { email: { address: "adres-degil" } } },
      { extra: true },
      null,
    ];
    for (const patch of bad) expect(() => parseAlertSettingsPatch(patch), JSON.stringify(patch)).toThrowError(code("invalid_input"));
  });
});

describe("applyAlertSettingsPatch", () => {
  it("yalnız verilen alanları değiştirir ve girdiyi bozmaz; undefined değer 'dokunma' demektir", () => {
    const before = current();
    const next = applyAlertSettingsPatch(before, { competitorOutlier: { minTier: 4, enabled: undefined }, weeklyDigest: { hour: 18 } });
    expect(next.competitorOutlier).toEqual({ enabled: true, minTier: 4 });
    expect(next.weeklyDigest).toEqual({ ...before.weeklyDigest, hour: 18 });
    expect(next.ownOutlier).toEqual(before.ownOutlier);
    expect(before).toEqual(DEFAULT_ALERT_SETTINGS);
  });

  it("e-posta: adres kırpılır; açmak adres ister; açıkken adresi silmek reddedilir; kapatıp silmek serbest", () => {
    expect(() => applyAlertSettingsPatch(current(), { channels: { email: { enabled: true } } })).toThrowError(code("invalid_input"));
    const on = applyAlertSettingsPatch(current(), { channels: { email: { enabled: true, address: " a@b.co " } } });
    expect(on.channels.email).toEqual({ enabled: true, address: "a@b.co" });
    expect(() => applyAlertSettingsPatch(on, { channels: { email: { address: "" } } })).toThrowError(code("invalid_input"));
    const off = applyAlertSettingsPatch(on, { channels: { email: { enabled: false, address: "" } } });
    expect(off.channels.email).toEqual({ enabled: false });
    expect(Object.keys(off.channels.email ?? {})).not.toContain("address");
  });

  it("Telegram: sohbet bağlı değilse açmak invalid_state; bağlıysa açılır; chatIdSet yamayla değişmez", () => {
    expect(() => applyAlertSettingsPatch(current(), { channels: { telegram: { enabled: true } } })).toThrowError(code("invalid_state"));
    const linked = current();
    linked.channels.telegram = { enabled: false, chatIdSet: true };
    expect(applyAlertSettingsPatch(linked, { channels: { telegram: { enabled: true } } }).channels.telegram).toEqual({ enabled: true, chatIdSet: true });
    expect(applyAlertSettingsPatch(linked, { weeklyDigest: { hour: 7 } }).channels.telegram?.chatIdSet).toBe(true);
  });

  it("kanal alanı hiç olmayan ayarda da çalışır (yoksa varsayılan kapalı kanallar)", () => {
    const bare = current();
    bare.channels = { inApp: true };
    const next = applyAlertSettingsPatch(bare, { weeklyDigest: { enabled: false } });
    expect(next.channels).toEqual({ inApp: true, email: { enabled: false }, telegram: { enabled: false, chatIdSet: false } });
  });
});
