/**
 * `getPanelContext` çalışma alanı çözümü (operatör modu): çerez → geçerliyse ve kayıtta varsa o; değilse `LOCAL_WORKSPACE_ID`.
 * Çerez ve depo sahtedir (ağ yok); mod kuralı env ile sürülür. Çözümleme kararının kendisi `choose.test.ts`'te.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DEFAULT_ID = "7a3f0000-0000-4000-8000-000000000001";
const USER_ID = "7a3f0000-0000-4000-8000-000000000a01";
const OTHER_ID = "5cc27bf7-635a-4e00-975a-d18122f8de30";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined, reads: 0 }));
const known = vi.hoisted(() => new Set<string>());

vi.mock("@/lib/workspace/cookie", () => ({
  readWorkspaceCookie: async () => {
    cookie.reads += 1;
    return cookie.value;
  },
}));

vi.mock("@/lib/data/supabase/from-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/supabase/from-env")>()),
  createSupabaseRepositoryFromEnv: () => ({ getWorkspace: async (id: string) => (known.has(id) ? { id } : null) }),
}));

async function resolveWsId(): Promise<string> {
  vi.resetModules(); // modül düzeyindeki depo önbelleği testler arasında sızmasın
  const { getPanelContext } = await import("@/lib/data");
  return (await getPanelContext()).wsId;
}

beforeEach(() => {
  vi.stubEnv("DATA_SOURCE", "supabase");
  vi.stubEnv("LOCAL_WORKSPACE_ID", DEFAULT_ID);
  vi.stubEnv("LOCAL_USER_ID", USER_ID);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sahte-anahtar-gercek-degil");
  vi.stubEnv("OPERATOR_MODE", "");
  vi.stubEnv("VERCEL", "");
  known.clear();
  known.add(DEFAULT_ID);
  known.add(OTHER_ID);
  cookie.value = undefined;
  cookie.reads = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPanelContext: çalışma alanı çözümü", () => {
  it("çerez yoksa LOCAL_WORKSPACE_ID", async () => {
    expect(await resolveWsId()).toBe(DEFAULT_ID);
  });

  it("çerez kayıtlı bir çalışma alanını gösteriyorsa o çalışma alanı", async () => {
    cookie.value = OTHER_ID;
    expect(await resolveWsId()).toBe(OTHER_ID);
  });

  it("çerez kayıtta olmayan (silinmiş/uydurma) ya da biçimsiz kimlikse varsayılana düşer", async () => {
    cookie.value = "11111111-1111-4111-8111-111111111111";
    expect(await resolveWsId()).toBe(DEFAULT_ID);
    cookie.value = "bu-bir-kimlik-degil";
    expect(await resolveWsId()).toBe(DEFAULT_ID);
  });

  it("yerel `next start` (NODE_ENV=production, OPERATOR_MODE yok) çerezle geçişi KAPATMAZ", async () => {
    vi.stubEnv("NODE_ENV", "production");
    cookie.value = OTHER_ID;
    expect(await resolveWsId()).toBe(OTHER_ID);
  });

  it("OPERATOR_MODE=off ya da Vercel'de çerez yok sayılır (okunmaz bile): yalnız LOCAL_WORKSPACE_ID", async () => {
    cookie.value = OTHER_ID;
    vi.stubEnv("OPERATOR_MODE", "off");
    expect(await resolveWsId()).toBe(DEFAULT_ID);
    vi.stubEnv("OPERATOR_MODE", "local");
    vi.stubEnv("VERCEL", "1");
    expect(await resolveWsId()).toBe(DEFAULT_ID);
    expect(cookie.reads).toBe(0);
  });

  it("mock veri kaynağında çerez yok sayılır: tek mock çalışma alanı", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    cookie.value = OTHER_ID;
    expect(await resolveWsId()).toBe("ws_mock_1");
    expect(cookie.reads).toBe(0);
  });
});
