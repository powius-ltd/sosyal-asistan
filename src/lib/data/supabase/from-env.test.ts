import { afterEach, describe, expect, it, vi } from "vitest";

import { getDataSource, getPanelContext, getRepository } from "@/lib/data";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { createSupabaseRepositoryFromEnv, readLocalSupabaseEnv } from "@/lib/data/supabase/from-env";

const WS = "7a3f0000-0000-4000-8000-000000000001";
const USER = "7a3f0000-0000-4000-8000-000000000a01";

afterEach(() => vi.unstubAllEnvs());

describe("readLocalSupabaseEnv", () => {
  it("iki kimlik de UUID ise döner (boşluk kırpılır)", () => {
    expect(readLocalSupabaseEnv({ LOCAL_WORKSPACE_ID: ` ${WS} `, LOCAL_USER_ID: USER })).toEqual({ workspaceId: WS, userId: USER });
  });

  it("eksik değişkenleri Türkçe ve adıyla söyler", () => {
    expect(() => readLocalSupabaseEnv({})).toThrowError(/LOCAL_WORKSPACE_ID, LOCAL_USER_ID/);
    expect(() => readLocalSupabaseEnv({ LOCAL_WORKSPACE_ID: WS })).toThrowError(/LOCAL_USER_ID/);
    expect(() => readLocalSupabaseEnv({ LOCAL_USER_ID: USER })).toThrowError(/DATA_SOURCE=supabase için env eksik: LOCAL_WORKSPACE_ID/);
  });

  it("UUID olmayan değeri reddeder ve değeri iletiye yazmaz", () => {
    let message = "";
    try {
      readLocalSupabaseEnv({ LOCAL_WORKSPACE_ID: "gizli-değer", LOCAL_USER_ID: USER });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/UUID biçiminde/);
    expect(message).not.toContain("gizli-değer");
  });
});

describe("DATA_SOURCE=supabase", () => {
  const stubSupabase = () => {
    vi.stubEnv("DATA_SOURCE", "supabase");
    vi.stubEnv("LOCAL_WORKSPACE_ID", WS);
    vi.stubEnv("LOCAL_USER_ID", USER);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sahte-anahtar-gercek-degil");
  };

  it("depo Supabase uygulamasıdır (ağ çağrısı yok); mock varsayılan kalır", () => {
    stubSupabase();
    expect(getDataSource()).toBe("supabase");
    const repo = createSupabaseRepositoryFromEnv();
    expect(typeof repo.listContent).toBe("function");
    expect(getRepository()).toBe(getRepository()); // süreç boyunca tek örnek
    vi.stubEnv("DATA_SOURCE", "mock");
    expect(getDataSource()).toBe("mock");
  });

  it("panel bağlamı: wsId = LOCAL_WORKSPACE_ID, now = gerçek saat (MOCK_NOW değil)", async () => {
    stubSupabase();
    const before = Date.now();
    const { wsId, now } = await getPanelContext();
    expect(wsId).toBe(WS);
    expect(now.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(now.toISOString()).not.toBe(MOCK_NOW);
  });

  it("env eksikse depo/bağlam açık Türkçe hata verir", async () => {
    vi.stubEnv("DATA_SOURCE", "supabase");
    vi.stubEnv("LOCAL_WORKSPACE_ID", "");
    vi.stubEnv("LOCAL_USER_ID", "");
    vi.resetModules(); // önceki testin süreç içi önbelleğe aldığı depo görünmesin
    const fresh = await import("@/lib/data");
    expect(() => fresh.getRepository()).toThrowError(/LOCAL_WORKSPACE_ID, LOCAL_USER_ID/);
    await expect(fresh.getPanelContext()).rejects.toThrowError(/LOCAL_WORKSPACE_ID, LOCAL_USER_ID/);
  });
});
