import { describe, expect, it } from "vitest";

import type { OwnAccount } from "@/lib/domain/competitor";
import { chartScopeLabel, notesScopeLabel, resolveAccountScope } from "@/components/overview/account-scope";

const account = (id: string, platform: OwnAccount["platform"]): OwnAccount => ({
  id,
  workspaceId: "ws_test",
  platform,
  handle: id,
  connection: "connected",
  scopes: [],
  createdAt: "2026-01-01T00:00:00.000Z",
});

const accounts = [account("oa_1", "instagram"), account("oa_2", "tiktok"), account("oa_3", "instagram")];

describe("resolveAccountScope", () => {
  it("parametre yoksa ya da bilinmiyorsa tüm hesaplar", () => {
    expect(resolveAccountScope(accounts, undefined)).toEqual({});
    expect(resolveAccountScope(accounts, "oa_yok")).toEqual({});
  });

  it("geçerli hesabı seçer (aynı platformdaki diğer hesaplar karışmaz)", () => {
    expect(resolveAccountScope(accounts, "oa_1").selected?.id).toBe("oa_1");
    expect(resolveAccountScope(accounts, "oa_2").selected?.platform).toBe("tiktok");
  });

  it("dizi verilirse ilk değer kullanılır", () => {
    expect(resolveAccountScope(accounts, ["oa_3", "oa_2"]).selected?.id).toBe("oa_3");
  });
});

describe("kapsam etiketleri (D3-06)", () => {
  it("notlar: çok hesapta süzgeç seçili olsa da 'Tüm hesapların için'; tek hesapta hesap adı", () => {
    expect(notesScopeLabel(accounts)).toBe("Tüm hesapların için");
    expect(notesScopeLabel([account("oa_2", "tiktok")])).toBe("@oa_2 · TikTok için");
  });

  it("grafik: seçili hesap ya da tek hesap adıyla; aksi halde 'Tüm hesaplar'", () => {
    expect(chartScopeLabel(accounts)).toBe("Tüm hesaplar");
    expect(chartScopeLabel(accounts, accounts[1])).toBe("@oa_2 · TikTok");
    expect(chartScopeLabel([account("oa_1", "instagram")])).toBe("@oa_1 · Instagram");
  });
});
