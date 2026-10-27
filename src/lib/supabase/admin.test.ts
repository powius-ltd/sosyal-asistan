import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_URL = "http://127.0.0.1:54321";
// Sahte anahtar (gerçek değil): yalnız "hata iletisine sızmıyor" denetimi için.
const FAKE_KEY = "test-service-role-key-not-real";

async function loadAdmin() {
  vi.resetModules();
  return import("@/lib/supabase/admin");
}

describe("admin (service role) istemcisi", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", FAKE_URL);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", FAKE_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("env doluyken istemci üretir (ağ çağrısı yok)", async () => {
    const { createAdminClient } = await loadAdmin();
    const client = createAdminClient();
    expect(typeof client.from).toBe("function");
    expect(typeof client.rpc).toBe("function");
  });

  it("getAdminClient süreç boyunca tek örnektir; createAdminClient her seferinde yenidir", async () => {
    const { createAdminClient, getAdminClient } = await loadAdmin();
    expect(getAdminClient()).toBe(getAdminClient());
    expect(createAdminClient()).not.toBe(createAdminClient());
  });

  it("env eksikse hangi değişkenlerin eksik olduğunu Türkçe söyler", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { createAdminClient } = await loadAdmin();
    expect(() => createAdminClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("yalnız anahtar eksikse yalnız onu adlandırır; hata iletisi env değerini içermez", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "   ");
    const { createAdminClient } = await loadAdmin();
    let message = "";
    try {
      createAdminClient();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(message).not.toContain("NEXT_PUBLIC_SUPABASE_URL,");
    expect(message).not.toContain(FAKE_URL);
    expect(message).not.toContain(FAKE_KEY);
  });

  it("eksik URL durumunda anahtar değeri iletiye sızmaz", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { createAdminClient } = await loadAdmin();
    let message = "";
    try {
      createAdminClient();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(message).not.toContain(FAKE_KEY);
  });
});
